/**
 * Shopify order sync — server-side library (no HTTP hop).
 *
 * Called directly from:
 *  - the OAuth callback via `after()` (non-blocking initial sync)
 *  - POST /api/stores/shopify/sync (manual refresh, authenticated)
 *  - the scheduled cron job (Phase 6)
 *
 * Properties:
 *  - Incremental: uses Store.lastSyncAt as updated_at_min on subsequent runs.
 *  - Paginated via the Link header; 429/Retry-After + call-limit backoff.
 *  - Idempotent: orders are upserted by the unique (teamId, storeId, externalId)
 *    index — safe to run twice.
 *  - Plan caps: pass { orderCap } to stop importing at the cap; orders beyond
 *    the cap are counted, not deleted (flagged via result.overLimit).
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import ProductModel from "@/models/Product";
import { fetchVariantCostsSafe } from "@/lib/shopify-graphql";
import { safeDecrypt } from "@/lib/encryption";
import { calcOrderProfit } from "@/lib/profit-engine";
import { parseUtmFromLandingSite } from "@/lib/meta-ads-hardening";
import { logger, toLogError } from "@/lib/logger";
import {
  SHOPIFY_API_VERSION,
  adminRestBase,
  parseLinkHeader,
  shopifyFetch,
  ShopifyApiError,
} from "@/lib/shopify";

export interface SyncOptions {
  /** Import orders updated on/after this date (defaults to incremental). */
  since?: Date;
  /** Stop importing new orders once the team's monthly total reaches this. -1 = unlimited. */
  orderCap?: number;
  /** Max pages to fetch per run (safety bound for cron). */
  maxPages?: number;
}

export interface SyncResult {
  storeId: string;
  synced: number;       // orders upserted this run
  skipped: number;      // orders that failed to upsert (logged)
  overLimit: number;    // orders seen but not imported because of the plan cap
  pages: number;
  incremental: boolean;
}

const DEFAULT_MAX_PAGES = 40; // 40 × 250 = 10k orders per run max

// ─── Shopify order shape (partial) ──────────────────────────────────────────

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  updated_at?: string;
  currency: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  total_tax: string;
  financial_status: string;
  cancelled_at?: string | null;
  refunds?: { transactions?: { amount?: string }[] }[];
  line_items?: {
    product_id?: number;
    sku?: string;
    title: string;
    quantity: number;
    price: string;
    variant_id?: number;
  }[];
  customer?: { id?: number; email?: string; orders_count?: number };
  email?: string;
  phone?: string;
  shipping_address?: { name?: string; address1?: string; city?: string; zip?: string; country_code?: string };
  billing_address?: { city?: string; zip?: string };
  payment_gateway_names?: string[];
  client_details?: { browser_ip?: string };
  landing_site?: string;
}

// ─── Webhook registration ───────────────────────────────────────────────────

/**
 * Register mandatory + order webhooks on the shop after OAuth connect.
 * Idempotent: Shopify dedupes identical (topic, address) subscriptions;
 * failures are logged, never thrown (connect must not fail because of this).
 */
export async function registerShopifyWebhooks(
  shop: string,
  accessToken: string,
  siteUrl: string
): Promise<void> {
  const topics = [
    // Mandatory GDPR webhooks
    "customers/data_request",
    "customers/redact",
    "shop/redact",
    // App lifecycle
    "app/uninstalled",
    // Order lifecycle for near-real-time profit data
    "orders/create",
    "orders/updated",
    "orders/cancelled",
    "refunds/create",
    // Fulfillment + catalogue (Phase 2)
    "fulfillments/create",
    "fulfillments/update",
    "products/update",
  ];

  for (const topic of topics) {
    const address = `${siteUrl}/api/webhooks/shopify/${topic.replace("/", "-")}`;
    try {
      await shopifyFetch(`${adminRestBase(shop)}/webhooks.json`, accessToken, {
        method: "POST",
        body: JSON.stringify({
          webhook: { topic, address, format: "json" },
        }),
      });
      logger.info("shopify webhook registered", { topic });
    } catch (e) {
      // Non-fatal — Shopify dedupes; a 422 (already exists) is fine too
      logger.warn("shopify webhook registration failed (non-fatal)", { topic }, toLogError(e));
    }
  }
}

// ─── Main sync ──────────────────────────────────────────────────────────────

export async function syncShopifyStore(
  storeId: string,
  teamId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(storeId) || !mongoose.Types.ObjectId.isValid(teamId)) {
    throw new Error("Invalid storeId or teamId");
  }

  const store = await StoreModel.findOne({
    _id: storeId,
    teamId,
    platform: "shopify",
    isActive: true,
  });
  if (!store) throw new Error("Store not found");

  const accessToken = safeDecrypt(store.accessToken);
  if (!accessToken) {
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: "Access token missing or corrupt — reconnect the store.",
    });
    throw new Error("Access token missing or corrupt");
  }

  // ── Incremental window ────────────────────────────────────────────────────
  const since = options.since ?? store.lastSyncAt ?? undefined;
  const incremental = !!since;

  await StoreModel.findByIdAndUpdate(storeId, {
    syncStatus: "syncing",
    syncError: null,
    syncStartedAt: new Date(),
    syncPages: 0,
    syncSyncedCount: 0,
  });

  const result: SyncResult = {
    storeId: store._id.toString(),
    synced: 0,
    skipped: 0,
    overLimit: 0,
    pages: 0,
    incremental,
  };

  try {
    const params = new URLSearchParams({
      status: "any",
      limit: "250",
      fields:
        "id,name,created_at,updated_at,currency,total_price,subtotal_price," +
        "total_discounts,total_shipping_price_set,total_tax,financial_status," +
        "refunds,line_items,customer,email",
    });
    if (since) params.set("updated_at_min", since.toISOString());

    let page: string | null =
      `${adminRestBase(store.domain!)}/orders.json?${params.toString()}`;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    const orderCap = options.orderCap ?? -1;

    // For cap enforcement we need the current monthly count once
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

    // COGS fallback (Phase 2): Shopify variant "cost per item" via GraphQL,
    // merged over any merchant-entered variant COGS already in the DB.
    // Best-effort: a GraphQL failure leaves COGS at the DB values (or 0),
    // and the COGS editor / backfill job can still fill them later.
    const cogsByVariant = new Map<string, number>();
    try {
      const products = await ProductModel.find({ storeId: store._id, teamId: store.teamId })
        .select("variantCogs defaultCogs")
        .lean();
      for (const prod of products) {
        for (const v of prod.variantCogs ?? []) cogsByVariant.set(v.variantId, v.cogs);
      }
    } catch (e) {
      logger.warn("shopify cogs map from DB failed (continuing with GraphQL only)", {}, toLogError(e));
    }
    if (store.domain) {
      const gqlCosts = await fetchVariantCostsSafe(store.domain, accessToken);
      for (const [variantId, cost] of gqlCosts) {
        if (!cogsByVariant.has(variantId)) cogsByVariant.set(variantId, cost);
      }
    }

    while (page && result.pages < maxPages) {
      const res = await shopifyFetch(page, accessToken);
      result.pages++;

      const data = (await res.json()) as { orders?: ShopifyOrder[] };
      const orders = data.orders ?? [];

      for (const order of orders) {
        // Plan cap: stop importing new orders, count the rest as overLimit
        if (orderCap > 0 && monthlyCount >= orderCap) {
          result.overLimit++;
          continue;
        }
        try {
          await upsertShopifyOrder(
            order,
            store._id.toString(),
            teamId,
            store.currency ?? "USD",
            cogsByVariant
          );
          result.synced++;
          if (orderCap > 0) monthlyCount++;
        } catch (e) {
          result.skipped++;
          logger.warn("shopify order upsert failed", { orderId: order.id }, toLogError(e));
        }
      }

      // Sync progress (polled by the dashboard): resumable because a
      // re-run restarts from lastSyncAt and upserts are idempotent.
      await StoreModel.findByIdAndUpdate(storeId, {
        syncPages: result.pages,
        syncSyncedCount: result.synced,
      }).catch(() => undefined);

      const links = parseLinkHeader(res.headers.get("link"));
      page = links.next ?? null;
    }

    const totalOrders = await OrderModel.countDocuments({
      teamId: store.teamId,
      storeId: store._id,
    });
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "idle",
      lastSyncAt: new Date(),
      ordersCount: totalOrders,
      syncPages: result.pages,
      syncSyncedCount: result.synced,
      syncError: null,
    });

    logger.info("shopify sync complete", {
      storeId: result.storeId,
      synced: result.synced,
      skipped: result.skipped,
      overLimit: result.overLimit,
      pages: result.pages,
      incremental,
    });
    return result;
  } catch (err) {
    // Sanitized error — never include tokens or raw bodies
    const message =
      err instanceof ShopifyApiError
        ? `Shopify API error ${err.status}`
        : err instanceof Error
          ? err.message.slice(0, 200)
          : "Sync failed";
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: message,
    });
    logger.error("shopify sync failed", toLogError(err), { storeId: result.storeId });
    throw err;
  }
}

// ─── Order upsert ───────────────────────────────────────────────────────────

const p = (v: string | undefined | null): number => {
  const n = parseFloat(v ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function mapShopifyStatus(
  financialStatus: string
): "pending" | "fulfilled" | "refunded" | "cancelled" {
  const map: Record<string, "pending" | "fulfilled" | "refunded" | "cancelled"> = {
    paid: "fulfilled",
    pending: "pending",
    partially_paid: "pending",
    refunded: "refunded",
    voided: "cancelled",
    partially_refunded: "fulfilled",
    authorized: "pending",
  };
  return map[financialStatus] ?? "fulfilled";
}

export async function upsertShopifyOrder(
  order: ShopifyOrder,
  storeId: string,
  teamId: string,
  storeCurrency: string,
  cogsByVariant: Map<string, number> = new Map()
): Promise<void> {
  // Money contract (see profit-engine.ts): grossRevenue is tax-exclusive and
  // already net of discounts; discounts/shippingRevenue/taxes are memos.
  const taxes = p(order.total_tax);
  const grossRevenue = p(order.total_price) - taxes;
  const discounts = p(order.total_discounts);
  const shippingRevenue = p(order.total_shipping_price_set?.shop_money?.amount);
  const currency = order.currency || storeCurrency;

  const refundAmount = (order.refunds ?? []).reduce(
    (sum, r) =>
      sum + (r.transactions ?? []).reduce((s, t) => s + p(t.amount), 0),
    0
  );

  // COGS fallback chain: merchant variant COGS / Shopify variant cost
  // (passed in) → 0, which the COGS editor and backfill job can fix later.
  // Never invent a cost: an unknown variant honestly reports 0.
  const lineItems = (order.line_items ?? []).map((li) => {
    const variantKey = li.variant_id ? String(li.variant_id) : "";
    const cogs = variantKey ? (cogsByVariant.get(variantKey) ?? 0) : 0;
    return {
      productId: li.product_id ? String(li.product_id) : undefined,
      sku: li.sku ?? undefined,
      name: li.title,
      quantity: li.quantity,
      price: p(li.price),
      cogs,
      totalRevenue: p(li.price) * li.quantity,
      totalCogs: cogs * li.quantity,
    };
  });
  const totalCogs = lineItems.reduce((sum, li) => sum + li.totalCogs, 0);

  const profit = calcOrderProfit({
    grossRevenue,
    discounts,
    shippingRevenue,
    shippingCost: 0,
    totalCogs,
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
        orderNumber: order.name,
        orderDate: new Date(order.created_at),
        currency,
        grossRevenue,
        discounts,
        netRevenue: profit.netRevenue,
        totalCogs,
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
        customerId: order.customer?.id ? String(order.customer.id) : undefined,
        customerEmail: order.email ?? order.customer?.email,
        customerName: order.shipping_address?.name,
        customerPhone: order.phone,
        shippingCity: order.shipping_address?.city,
        shippingPostalCode: order.shipping_address?.zip,
        shippingCountry: order.shipping_address?.country_code,
        billingCity: order.billing_address?.city,
        billingPostalCode: order.billing_address?.zip,
        browserIp: order.client_details?.browser_ip,
        landingSite: order.landing_site ?? undefined,
        source: parseUtmFromLandingSite(order.landing_site).utmSource ?? undefined,
        utmCampaign: parseUtmFromLandingSite(order.landing_site).utmCampaign ?? undefined,
        paymentMethod: order.payment_gateway_names?.[0],
        isFirstOrder: (order.customer?.orders_count ?? 1) <= 1,
        // A cancelled order is cancelled regardless of financial status.
        status: order.cancelled_at ? "cancelled" : mapShopifyStatus(order.financial_status),
        importedFrom: "api",
      },
    },
    { upsert: true }
  );
}

export { SHOPIFY_API_VERSION };
