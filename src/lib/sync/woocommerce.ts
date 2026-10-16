/**
 * WooCommerce order sync — server-side library (no HTTP hop).
 *
 * Called directly from the [storeId]/sync dispatcher, the manual
 * POST /api/stores/woocommerce/sync route (authenticated), and the
 * scheduled cron job (Phase 6).
 *
 * Incremental: uses Store.lastSyncAt as `after` on subsequent runs.
 * Idempotent: upserts by the unique (teamId, storeId, externalId) index.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { safeDecrypt } from "@/lib/encryption";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logger, toLogError } from "@/lib/logger";

const WC_API_VERSION = "wc/v3";
const PAGE_SIZE = 100;

export interface WooSyncOptions {
  since?: Date;
  orderCap?: number;
  maxPages?: number;
}

export interface WooSyncResult {
  storeId: string;
  synced: number;
  skipped: number;
  overLimit: number;
  pages: number;
  incremental: boolean;
}

export async function syncWooCommerceStore(
  storeId: string,
  teamId: string,
  options: WooSyncOptions = {}
): Promise<WooSyncResult> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(storeId) || !mongoose.Types.ObjectId.isValid(teamId)) {
    throw new Error("Invalid storeId or teamId");
  }

  const store = await StoreModel.findOne({
    _id: storeId,
    teamId,
    platform: "woocommerce",
    isActive: true,
  });
  if (!store) throw new Error("Store not found");

  const consumerKey = safeDecrypt(store.accessToken);
  const consumerSecret = safeDecrypt(store.refreshToken);
  if (!consumerKey || !consumerSecret) {
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: "API credentials missing or corrupt — reconnect the store",
    });
    throw new Error("API credentials missing");
  }

  const baseUrl = (store.wooSiteUrl ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: "Store URL not saved — reconnect the store",
    });
    throw new Error("Store URL missing");
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  const since = options.since ?? store.lastSyncAt ?? undefined;
  const incremental = !!since;

  await StoreModel.findByIdAndUpdate(storeId, { syncStatus: "syncing", syncError: null });

  const result: WooSyncResult = {
    storeId: store._id.toString(),
    synced: 0,
    skipped: 0,
    overLimit: 0,
    pages: 0,
    incremental,
  };

  const orderCap = options.orderCap ?? -1;
  let monthlyCount = 0;
  if (orderCap > 0) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    monthlyCount = await OrderModel.countDocuments({
      teamId: store.teamId,
      orderDate: { $gte: startOfMonth },
    });
  }

  try {
    let page = 1;
    let hasMore = true;
    const maxPages = options.maxPages ?? 100;

    while (hasMore && page <= maxPages) {
      const params = new URLSearchParams({
        status: "any",
        per_page: String(PAGE_SIZE),
        page: String(page),
        orderby: "date",
        order: "desc",
      });
      if (since) params.set("after", since.toISOString());

      const url = `${baseUrl}/wp-json/${WC_API_VERSION}/orders?${params.toString()}`;
      const res = await fetch(url, { headers });

      if (res.status === 401 || res.status === 403) {
        await StoreModel.findByIdAndUpdate(storeId, {
          syncStatus: "error",
          syncError: "WooCommerce rejected the API credentials — reconnect the store",
        });
        throw new Error("WooCommerce auth error");
      }
      if (!res.ok) {
        await StoreModel.findByIdAndUpdate(storeId, {
          syncStatus: "error",
          syncError: `WooCommerce API error ${res.status}`,
        });
        throw new Error(`WooCommerce API error ${res.status}`);
      }

      const orders = (await res.json()) as WooOrder[];
      result.pages++;

      if (!Array.isArray(orders) || orders.length === 0) break;

      for (const order of orders) {
        if (orderCap > 0 && monthlyCount >= orderCap) {
          result.overLimit++;
          continue;
        }
        try {
          await upsertWooOrder(order, store._id.toString(), teamId, store.currency ?? "USD");
          result.synced++;
          if (orderCap > 0) monthlyCount++;
        } catch (e) {
          result.skipped++;
          logger.warn("woo order upsert failed", { orderId: order.id }, toLogError(e));
        }
      }

      hasMore = orders.length === PAGE_SIZE;
      page++;
    }

    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "idle",
      lastSyncAt: new Date(),
      ordersCount: result.synced,
      syncError: null,
    });

    logger.info("woocommerce sync complete", {
      storeId: result.storeId,
      synced: result.synced,
      skipped: result.skipped,
      overLimit: result.overLimit,
      incremental,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "Sync failed";
    await StoreModel.findByIdAndUpdate(storeId, { syncStatus: "error", syncError: message });
    logger.error("woocommerce sync failed", toLogError(err), { storeId: result.storeId });
    throw err;
  }
}

// ─── WooCommerce order shape (partial) ───────────────────────────────────────

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  date_created: string;
  currency: string;
  total: string;
  discount_total: string;
  shipping_total: string;
  total_tax: string;
  line_items: {
    name: string;
    product_id: number | null;
    sku: string;
    quantity: number;
    price: number;
    total: string;
  }[];
  refunds: { id: number; total: string }[];
  billing?: { email?: string };
  customer_id: number;
}

const p = (v: string | number | undefined | null): number => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function mapWooStatus(status: string): "fulfilled" | "pending" | "refunded" | "cancelled" {
  const map: Record<string, "fulfilled" | "pending" | "refunded" | "cancelled"> = {
    completed: "fulfilled",
    processing: "fulfilled",
    "on-hold": "pending",
    pending: "pending",
    refunded: "refunded",
    cancelled: "cancelled",
    failed: "cancelled",
  };
  return map[status] ?? "fulfilled";
}

export async function upsertWooOrder(
  order: WooOrder,
  storeId: string,
  teamId: string,
  storeCurrency: string
): Promise<void> {
  // Money contract (see profit-engine.ts): grossRevenue is tax-exclusive and
  // already net of discounts; discounts/shippingRevenue/taxes are memos.
  const taxes = p(order.total_tax);
  const grossRevenue = p(order.total) - taxes;
  const discounts = p(order.discount_total);
  const shippingRev = p(order.shipping_total);
  const currency = order.currency || storeCurrency;
  const refundAmount = order.refunds.reduce((sum, r) => sum + Math.abs(p(r.total)), 0);

  const lineItems = order.line_items.map((li) => ({
    productId: li.product_id ? String(li.product_id) : undefined,
    sku: li.sku || undefined,
    name: li.name,
    quantity: li.quantity,
    price: p(li.price),
    cogs: 0,
    totalRevenue: p(li.total),
    totalCogs: 0,
  }));

  const profit = calcOrderProfit({
    grossRevenue,
    discounts,
    shippingRevenue: shippingRev,
    shippingCost: 0,
    totalCogs: 0,
    transactionFees: 0,
    taxes,
    refundAmount,
    chargebackAmount: 0,
    adSpendAllocated: 0,
  });

  const teamOid = new mongoose.Types.ObjectId(teamId);
  const storeOid = new mongoose.Types.ObjectId(storeId);

  await OrderModel.findOneAndUpdate(
    { teamId: teamOid, storeId: storeOid, externalId: String(order.id) },
    {
      $set: {
        storeId: storeOid,
        teamId: teamOid,
        externalId: String(order.id),
        orderNumber: order.number ? `#${order.number}` : String(order.id),
        orderDate: new Date(order.date_created),
        currency,
        grossRevenue,
        discounts,
        netRevenue: profit.netRevenue,
        totalCogs: 0,
        shippingCost: 0,
        shippingRevenue: shippingRev,
        transactionFees: 0,
        taxes,
        refundAmount,
        chargebackAmount: 0,
        adSpendAllocated: 0,
        netProfit: profit.netProfit,
        profitMargin: profit.netMargin,
        lineItems,
        customerId: order.customer_id ? String(order.customer_id) : undefined,
        customerEmail: order.billing?.email,
        isFirstOrder: false,
        status: mapWooStatus(order.status),
        importedFrom: "api",
      },
    },
    { upsert: true }
  );
}
