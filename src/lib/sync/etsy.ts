/**
 * Etsy order sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()`, the manual
 * POST /api/stores/etsy/sync route (authenticated), the [storeId]/sync
 * dispatcher, and the scheduled cron job (Phase 6).
 *
 * Incremental: uses Store.lastSyncAt as min_created on subsequent runs.
 * Idempotent: upserts by the unique (teamId, storeId, externalId) index.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { getValidEtsyToken, EtsyTokenError } from "@/lib/etsy-token";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logger, toLogError } from "@/lib/logger";

export interface EtsySyncOptions {
  since?: Date;
  orderCap?: number; // -1 = unlimited
  maxPages?: number;
}

export interface EtsySyncResult {
  storeId: string;
  synced: number;
  skipped: number;
  overLimit: number;
  pages: number;
  incremental: boolean;
}

const DEFAULT_MAX_PAGES = 100; // 100 × 100 receipts per run max

export async function syncEtsyStore(
  storeId: string,
  teamId: string,
  options: EtsySyncOptions = {}
): Promise<EtsySyncResult> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(storeId) || !mongoose.Types.ObjectId.isValid(teamId)) {
    throw new Error("Invalid storeId or teamId");
  }

  const store = await StoreModel.findOne({
    _id: storeId,
    teamId,
    platform: "etsy",
    isActive: true,
  });
  if (!store) throw new Error("Store not found");
  if (!store.etsyShopId) {
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: "Etsy shop ID is missing — please reconnect the store.",
    });
    throw new Error("Etsy shop ID missing");
  }

  let accessToken: string;
  try {
    accessToken = await getValidEtsyToken(store);
  } catch (err) {
    const msg = err instanceof EtsyTokenError ? err.message : "Failed to obtain Etsy access token";
    await StoreModel.findByIdAndUpdate(storeId, { syncStatus: "error", syncError: msg });
    throw new Error(msg);
  }

  const since = options.since ?? store.lastSyncAt ?? undefined;
  const incremental = !!since;

  await StoreModel.findByIdAndUpdate(storeId, { syncStatus: "syncing", syncError: null });

  const result: EtsySyncResult = {
    storeId: store._id.toString(),
    synced: 0,
    skipped: 0,
    overLimit: 0,
    pages: 0,
    incremental,
  };

  const clientId = process.env.ETSY_CLIENT_ID;
  const shopId = store.etsyShopId;
  const currency = store.currency ?? "USD";
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
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    const minCreated = since ? Math.floor(since.getTime() / 1000) : undefined;

    while (hasMore && result.pages < maxPages) {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        was_paid: "true",
      });
      if (minCreated) params.set("min_created", String(minCreated));

      const url =
        `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts?${params.toString()}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, "x-api-key": clientId ?? "" },
      });

      if (!res.ok) {
        const status = res.status;
        await StoreModel.findByIdAndUpdate(storeId, {
          syncStatus: "error",
          syncError: `Etsy API error ${status}`,
        });
        throw new Error(`Etsy API error ${status}`);
      }

      const data = (await res.json()) as EtsyReceiptsResponse;
      const receipts = data.results ?? [];
      result.pages++;

      for (const receipt of receipts) {
        if (orderCap > 0 && monthlyCount >= orderCap) {
          result.overLimit++;
          continue;
        }
        try {
          await upsertEtsyOrder(receipt, store._id.toString(), teamId, currency);
          result.synced++;
          if (orderCap > 0) monthlyCount++;
        } catch (e) {
          result.skipped++;
          logger.warn("etsy receipt upsert failed", { receiptId: receipt.receipt_id }, toLogError(e));
        }
      }

      hasMore = receipts.length === limit;
      offset += receipts.length;
    }

    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "idle",
      lastSyncAt: new Date(),
      ordersCount: result.synced,
      syncError: null,
    });

    logger.info("etsy sync complete", {
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
    logger.error("etsy sync failed", toLogError(err), { storeId: result.storeId });
    throw err;
  }
}

// ─── Etsy API types (partial) ─────────────────────────────────────────────────

export interface EtsyReceiptsResponse {
  count: number;
  results: EtsyReceipt[];
}

export interface EtsyReceipt {
  receipt_id: number;
  status: string;
  is_shipped: boolean;
  is_paid: boolean;
  create_timestamp: number;
  currency_code: string;
  grandtotal: EtsyMoney;
  subtotal: EtsyMoney;
  total_price: EtsyMoney;
  total_shipping_cost: EtsyMoney;
  total_tax_cost: EtsyMoney;
  total_vat_cost?: EtsyMoney;
  discount_amt: EtsyMoney;
  buyer_user_id: number;
  buyer_email?: string;
  transactions: EtsyTransaction[];
  refunds?: EtsyRefund[];
}

export interface EtsyMoney {
  amount: number;
  divisor: number;
  currency_code: string;
}

export interface EtsyTransaction {
  transaction_id: number;
  listing_id?: number;
  sku?: string;
  title: string;
  quantity: number;
  price: EtsyMoney;
}

export interface EtsyRefund {
  amount: EtsyMoney;
  created_timestamp: number;
  reason?: string;
}

function toFloat(m: EtsyMoney | undefined | null): number {
  if (!m) return 0;
  const n = m.divisor > 0 ? m.amount / m.divisor : 0;
  return Number.isFinite(n) ? n : 0;
}

export function mapEtsyStatus(
  receipt: EtsyReceipt
): "fulfilled" | "pending" | "refunded" | "cancelled" {
  if (receipt.status === "canceled") return "cancelled";
  const totalRefunded = (receipt.refunds ?? []).reduce((s, r) => s + toFloat(r.amount), 0);
  const grandTotal = toFloat(receipt.grandtotal);
  if (grandTotal > 0 && totalRefunded >= grandTotal * 0.99) return "refunded";
  if (!receipt.is_paid) return "pending";
  return "fulfilled";
}

export async function upsertEtsyOrder(
  receipt: EtsyReceipt,
  storeId: string,
  teamId: string,
  storeCurrency: string
): Promise<void> {
  // Money contract (see profit-engine.ts): grossRevenue is tax-exclusive and
  // already net of discounts; discounts/shippingRevenue/taxes are memos.
  const taxes = toFloat(receipt.total_tax_cost) + toFloat(receipt.total_vat_cost);
  const grossRevenue = toFloat(receipt.grandtotal) - taxes;
  const discounts = toFloat(receipt.discount_amt);
  const shippingRevenue = toFloat(receipt.total_shipping_cost);
  const refundAmount = (receipt.refunds ?? []).reduce((s, r) => s + toFloat(r.amount), 0);
  const currency = receipt.currency_code || storeCurrency;

  const lineItems = receipt.transactions.map((tx) => {
    const unitPrice = toFloat(tx.price);
    const qty = tx.quantity ?? 1;
    return {
      productId: tx.listing_id ? String(tx.listing_id) : undefined,
      sku: tx.sku ?? undefined,
      name: tx.title,
      quantity: qty,
      price: unitPrice,
      cogs: 0,
      totalRevenue: unitPrice * qty,
      totalCogs: 0,
    };
  });

  const profit = calcOrderProfit({
    grossRevenue,
    discounts,
    shippingRevenue,
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
    { teamId: teamOid, storeId: storeOid, externalId: String(receipt.receipt_id) },
    {
      $set: {
        storeId: storeOid,
        teamId: teamOid,
        externalId: String(receipt.receipt_id),
        orderNumber: String(receipt.receipt_id),
        orderDate: new Date(receipt.create_timestamp * 1000),
        currency,
        grossRevenue,
        discounts,
        netRevenue: profit.netRevenue,
        totalCogs: 0,
        shippingCost: 0,
        shippingRevenue,
        transactionFees: 0,
        taxes,
        refundAmount,
        chargebackAmount: 0,
        adSpendAllocated: 0,
        netProfit: profit.netProfit,
        profitMargin: profit.netMargin,
        lineItems,
        customerId: String(receipt.buyer_user_id),
        customerEmail: receipt.buyer_email,
        isFirstOrder: false,
        status: mapEtsyStatus(receipt),
        importedFrom: "api",
      },
    },
    { upsert: true }
  );
}
