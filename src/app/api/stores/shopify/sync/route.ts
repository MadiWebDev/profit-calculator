import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { safeDecrypt } from "@/lib/encryption";
import { calcOrderProfit } from "@/lib/profit-engine";

const SHOPIFY_API_VERSION = "2024-01";

/**
 * POST /api/stores/shopify/sync
 *
 * Pulls orders from Shopify and upserts them into the DB.
 * Called fire-and-forget from the OAuth callback after a store connects,
 * and can be called again manually to refresh.
 *
 * Body: { storeId: string, teamId: string }
 *
 * This endpoint is internal — it doesn't require a user session because
 * it's triggered server-side by the callback. It does validate that the
 * storeId belongs to the supplied teamId.
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

  const store = await StoreModel.findOne({ _id: storeId, teamId, platform: "shopify", isActive: true });
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const accessToken = safeDecrypt(store.accessToken);
  if (!accessToken) {
    await StoreModel.findByIdAndUpdate(storeId, { syncStatus: "error", syncError: "Access token missing or corrupt" });
    return NextResponse.json({ error: "Access token missing" }, { status: 500 });
  }

  // Mark as syncing
  await StoreModel.findByIdAndUpdate(storeId, { syncStatus: "syncing", syncError: null });

  try {
    let page = `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
      `?status=any&limit=250&fields=id,name,created_at,currency,total_price,` +
      `subtotal_price,total_discounts,total_shipping_price_set,` +
      `total_tax,financial_status,refunds,line_items,customer,email`;

    let totalImported = 0;

    // Paginate through all orders using the Link header
    while (page) {
      const res = await fetch(page, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("[Shopify Sync] Orders fetch failed", res.status, txt);
        await StoreModel.findByIdAndUpdate(storeId, {
          syncStatus: "error",
          syncError: `Shopify API error ${res.status}`,
        });
        return NextResponse.json({ error: "Shopify API error", status: res.status }, { status: 502 });
      }

      const data = await res.json();
      const orders: ShopifyOrder[] = data.orders ?? [];

      for (const order of orders) {
        try {
          await upsertOrder(order, store._id.toString(), teamId, store.currency ?? "USD");
          totalImported++;
        } catch (e) {
          console.warn("[Shopify Sync] Failed to upsert order", order.id, e);
        }
      }

      // Follow the next page link if present
      const linkHeader = res.headers.get("link") ?? "";
      const nextMatch  = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      page = nextMatch ? nextMatch[1] : "";
    }

    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "idle",
      lastSyncAt: new Date(),
      ordersCount: totalImported,
      syncError:   null,
    });

    return NextResponse.json({ synced: totalImported });
  } catch (err) {
    console.error("[Shopify Sync] Unexpected error", err);
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError: err instanceof Error ? err.message : "Unknown error",
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

// ─── Shopify order shape (partial) ──────────────────────────────────────────

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  currency: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  total_tax: string;
  financial_status: string;
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
}

// ─── Upsert a single order ───────────────────────────────────────────────────

async function upsertOrder(
  order: ShopifyOrder,
  storeId: string,
  teamId: string,
  storeCurrency: string,
) {
  const p = (v: string | undefined | null) => parseFloat(v ?? "0") || 0;

  const grossRevenue    = p(order.total_price);
  const discounts       = p(order.total_discounts);
  const shippingRevenue = p(order.total_shipping_price_set?.shop_money?.amount);
  const taxes           = p(order.total_tax);
  const currency        = order.currency || storeCurrency;

  // Sum refunds
  const refundAmount = (order.refunds ?? []).reduce((sum, r) => {
    return sum + (r.transactions ?? []).reduce((s, t) => s + p(t.amount), 0);
  }, 0);

  // Map line items
  const lineItems = (order.line_items ?? []).map((li) => ({
    productId:    li.product_id ? String(li.product_id) : undefined,
    sku:          li.sku ?? undefined,
    name:         li.title,
    quantity:     li.quantity,
    price:        p(li.price),
    cogs:         0, // Will be updated by the COGS editor
    totalRevenue: p(li.price) * li.quantity,
    totalCogs:    0,
  }));

  const profit = calcOrderProfit({
    grossRevenue,
    discounts,
    shippingRevenue,
    shippingCost:    0,   // unknown until user sets it
    totalCogs:       0,   // unknown until COGS are entered
    transactionFees: 0,
    taxes,
    refundAmount,
    chargebackAmount: 0,
    adSpendAllocated: 0,
  });

  // Map Shopify financial_status → our status enum
  const statusMap: Record<string, "fulfilled" | "pending" | "refunded" | "cancelled"> = {
    paid:          "fulfilled",
    pending:       "pending",
    partially_paid: "pending",
    refunded:      "refunded",
    voided:        "cancelled",
    partially_refunded: "fulfilled",
    authorized:    "pending",
  };
  const status = statusMap[order.financial_status] ?? "fulfilled";

  await OrderModel.findOneAndUpdate(
    { storeId, externalId: String(order.id) },
    {
      storeId,
      teamId,
      externalId:    String(order.id),
      orderNumber:   order.name,
      orderDate:     new Date(order.created_at),
      currency,
      grossRevenue,
      discounts,
      netRevenue:    profit.netRevenue,
      totalCogs:     0,
      shippingCost:  0,
      shippingRevenue,
      transactionFees: 0,
      taxes,
      refundAmount,
      chargebackAmount: 0,
      adSpendAllocated: 0,
      netProfit:     profit.netProfit,
      profitMargin:  profit.netMargin,
      lineItems,
      customerId:    order.customer?.id ? String(order.customer.id) : undefined,
      customerEmail: order.email ?? order.customer?.email,
      isFirstOrder:  (order.customer?.orders_count ?? 1) <= 1,
      status,
      importedFrom:  "api",
    },
    { upsert: true }
  );
}
