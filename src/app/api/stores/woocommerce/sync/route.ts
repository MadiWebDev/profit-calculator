import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { safeDecrypt } from "@/lib/encryption";
import { calcOrderProfit } from "@/lib/profit-engine";

const WC_API_VERSION = "wc/v3";
const PAGE_SIZE = 100; // WooCommerce max per_page

/**
 * POST /api/stores/woocommerce/sync
 *
 * Pulls orders from a WooCommerce store and upserts them into the DB.
 *
 * Body: { storeId: string; teamId: string }
 *
 * Internal endpoint — auth is enforced by validating that the storeId
 * belongs to the supplied teamId (same pattern as Shopify sync).
 */
export async function POST(req: NextRequest) {
  let body: { storeId?: string; teamId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { storeId, teamId } = body;
  if (!storeId || !teamId) {
    return NextResponse.json({ error: "storeId and teamId are required" }, { status: 400 });
  }

  await connectDB();

  const store = await StoreModel.findOne({
    _id: storeId,
    teamId,
    platform: "woocommerce",
    isActive: true,
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Consumer Key is stored as accessToken, Consumer Secret as refreshToken
  const consumerKey = safeDecrypt(store.accessToken);
  const consumerSecret = safeDecrypt(store.refreshToken);

  if (!consumerKey || !consumerSecret) {
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: "API credentials missing or corrupt — reconnect the store",
    });
    return NextResponse.json({ error: "API credentials missing" }, { status: 500 });
  }

  const baseUrl = (store.wooSiteUrl ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: "Store URL not saved — reconnect the store",
    });
    return NextResponse.json({ error: "Store URL missing" }, { status: 500 });
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  // Mark as syncing
  await StoreModel.findByIdAndUpdate(storeId, { syncStatus: "syncing", syncError: null });

  try {
    let page = 1;
    let totalImported = 0;
    let hasMore = true;

    while (hasMore) {
      const url =
        `${baseUrl}/wp-json/${WC_API_VERSION}/orders` +
        `?status=any&per_page=${PAGE_SIZE}&page=${page}` +
        `&orderby=date&order=desc`;

      const res = await fetch(url, { headers });

      if (res.status === 401 || res.status === 403) {
        await StoreModel.findByIdAndUpdate(storeId, {
          syncStatus: "error",
          syncError: "WooCommerce rejected the API credentials — reconnect the store",
        });
        return NextResponse.json({ error: "WooCommerce auth error" }, { status: 502 });
      }

      if (!res.ok) {
        const txt = await res.text();
        console.error("[WC Sync] Orders fetch failed", res.status, txt);
        await StoreModel.findByIdAndUpdate(storeId, {
          syncStatus: "error",
          syncError: `WooCommerce API error ${res.status}`,
        });
        return NextResponse.json({ error: "WooCommerce API error", status: res.status }, { status: 502 });
      }

      const orders: WooOrder[] = await res.json();

      if (!Array.isArray(orders) || orders.length === 0) {
        hasMore = false;
        break;
      }

      for (const order of orders) {
        try {
          await upsertOrder(order, storeId, teamId, store.currency ?? "USD");
          totalImported++;
        } catch (e) {
          console.warn("[WC Sync] Failed to upsert order", order.id, e);
        }
      }

      // WC uses page-based pagination — stop if we got fewer than per_page
      hasMore = orders.length === PAGE_SIZE;
      page++;
    }

    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "idle",
      lastSyncAt: new Date(),
      ordersCount: totalImported,
      syncError: null,
    });

    return NextResponse.json({ synced: totalImported });
  } catch (err) {
    console.error("[WC Sync] Unexpected error", err);
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: err instanceof Error ? err.message : "Unknown error",
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

// ─── WooCommerce order shape (partial) ───────────────────────────────────────

interface WooLineItem {
  id: number;
  name: string;
  product_id: number | null;
  variation_id?: number;
  sku: string;
  quantity: number;
  price: number;          // unit price (number, not string)
  total: string;          // line total string
  subtotal: string;
}

interface WooRefund {
  id: number;
  total: string;          // negative string e.g. "-10.00"
}

interface WooOrder {
  id: number;
  number: string;
  status: string;         // "pending" | "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed"
  date_created: string;   // ISO 8601
  currency: string;
  total: string;
  subtotal?: string;
  discount_total: string;
  shipping_total: string;
  total_tax: string;
  line_items: WooLineItem[];
  refunds: WooRefund[];
  billing?: { email?: string; first_name?: string; last_name?: string };
  customer_id: number;
}

// ─── Upsert a single order ────────────────────────────────────────────────────

async function upsertOrder(
  order: WooOrder,
  storeId: string,
  teamId: string,
  storeCurrency: string,
) {
  const p = (v: string | number | undefined | null) =>
    typeof v === "number" ? v : parseFloat(v ?? "0") || 0;

  const grossRevenue = p(order.total);
  const discounts    = p(order.discount_total);
  const shippingRev  = p(order.shipping_total);
  const taxes        = p(order.total_tax);
  const currency     = order.currency || storeCurrency;

  // WooCommerce refunds are negative totals
  const refundAmount = order.refunds.reduce((sum, r) => sum + Math.abs(p(r.total)), 0);

  // Map line items
  const lineItems = order.line_items.map((li) => ({
    productId:    li.product_id ? String(li.product_id) : undefined,
    sku:          li.sku || undefined,
    name:         li.name,
    quantity:     li.quantity,
    price:        p(li.price),
    cogs:         0, // populated later via COGS editor
    totalRevenue: p(li.total),
    totalCogs:    0,
  }));

  const profit = calcOrderProfit({
    grossRevenue,
    discounts,
    shippingRevenue:  shippingRev,
    shippingCost:     0,
    totalCogs:        0,
    transactionFees:  0,
    taxes,
    refundAmount,
    chargebackAmount: 0,
    adSpendAllocated: 0,
  });

  // Map WC status → internal status enum
  const statusMap: Record<string, "fulfilled" | "pending" | "refunded" | "cancelled"> = {
    completed:  "fulfilled",
    processing: "fulfilled",
    "on-hold":  "pending",
    pending:    "pending",
    refunded:   "refunded",
    cancelled:  "cancelled",
    failed:     "cancelled",
  };
  const status = statusMap[order.status] ?? "fulfilled";

  const customerEmail = order.billing?.email;

  await OrderModel.findOneAndUpdate(
    { storeId, externalId: String(order.id) },
    {
      storeId,
      teamId,
      externalId:      String(order.id),
      orderNumber:     order.number ? `#${order.number}` : String(order.id),
      orderDate:       new Date(order.date_created),
      currency,
      grossRevenue,
      discounts,
      netRevenue:      profit.netRevenue,
      totalCogs:       0,
      shippingCost:    0,
      shippingRevenue: shippingRev,
      transactionFees: 0,
      taxes,
      refundAmount,
      chargebackAmount:  0,
      adSpendAllocated:  0,
      netProfit:       profit.netProfit,
      profitMargin:    profit.netMargin,
      lineItems,
      customerId:      order.customer_id ? String(order.customer_id) : undefined,
      customerEmail,
      isFirstOrder:    false, // WC doesn't reliably expose order count per customer here
      status,
      importedFrom:    "api",
    },
    { upsert: true }
  );
}
