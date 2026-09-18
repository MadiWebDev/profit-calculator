import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { getValidEtsyToken, EtsyTokenError } from "@/lib/etsy-token";
import { calcOrderProfit } from "@/lib/profit-engine";

/**
 * POST /api/stores/etsy/sync
 *
 * Pulls all receipts (orders) from the Etsy Shops API and upserts them
 * into the local Orders collection.
 *
 * Called fire-and-forget from the OAuth callback after a store connects,
 * and dispatched by POST /api/stores/[storeId]/sync when the user hits
 * "Sync now" in the dashboard.
 *
 * Body: { storeId: string, teamId: string }
 *
 * This endpoint is internal — no user session required. Ownership is
 * validated by checking that storeId + teamId match in the DB.
 *
 * Etsy API reference:
 *  GET /v3/application/shops/{shop_id}/receipts
 *  https://developers.etsy.com/documentation/reference#operation/getShopReceipts
 */
export async function POST(req: NextRequest) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { storeId?: string; teamId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { storeId, teamId } = body;
  if (!storeId || !teamId) {
    return NextResponse.json(
      { error: "storeId and teamId are required" },
      { status: 400 }
    );
  }

  await connectDB();

  // ── Load and validate store ───────────────────────────────────────────────
  const store = await StoreModel.findOne({
    _id:      storeId,
    teamId,
    platform: "etsy",
    isActive: true,
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  if (!store.etsyShopId) {
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError:  "Etsy shop ID is missing — please reconnect the store.",
    });
    return NextResponse.json(
      { error: "Etsy shop ID missing" },
      { status: 422 }
    );
  }

  // ── Obtain a valid (possibly refreshed) access token ─────────────────────
  let accessToken: string;
  try {
    accessToken = await getValidEtsyToken(store);
  } catch (err) {
    const msg =
      err instanceof EtsyTokenError
        ? err.message
        : "Failed to obtain Etsy access token";
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError:  msg,
    });
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  // ── Mark as syncing ───────────────────────────────────────────────────────
  await StoreModel.findByIdAndUpdate(storeId, {
    syncStatus: "syncing",
    syncError:  null,
  });

  const clientId   = process.env.ETSY_CLIENT_ID!;
  const shopId     = store.etsyShopId;
  const currency   = store.currency ?? "USD";

  try {
    let totalSynced = 0;
    let offset      = 0;
    const limit     = 100; // Etsy max per page
    let hasMore     = true;

    // ── Paginate through all receipts ─────────────────────────────────────
    while (hasMore) {
      const url =
        `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts` +
        `?limit=${limit}&offset=${offset}&was_paid=true`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-api-key":   clientId,
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("[Etsy Sync] Receipts fetch failed:", res.status, txt);
        await StoreModel.findByIdAndUpdate(storeId, {
          syncStatus: "error",
          syncError:  `Etsy API error ${res.status}`,
        });
        return NextResponse.json(
          { error: "Etsy API error", status: res.status },
          { status: 502 }
        );
      }

      const data: EtsyReceiptsResponse = await res.json();
      const receipts = data.results ?? [];

      for (const receipt of receipts) {
        try {
          await upsertOrder(receipt, storeId, teamId, currency);
          totalSynced++;
        } catch (e) {
          console.warn("[Etsy Sync] Failed to upsert receipt", receipt.receipt_id, e);
        }
      }

      // Etsy uses offset-based pagination; stop when we receive fewer than limit
      hasMore = receipts.length === limit;
      offset += receipts.length;
    }

    // ── Mark sync complete ────────────────────────────────────────────────
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus:  "idle",
      lastSyncAt:  new Date(),
      ordersCount: totalSynced,
      syncError:   null,
    });

    return NextResponse.json({ synced: totalSynced });
  } catch (err) {
    console.error("[Etsy Sync] Unexpected error:", err);
    await StoreModel.findByIdAndUpdate(storeId, {
      syncStatus: "error",
      syncError:  err instanceof Error ? err.message : "Unknown error",
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

// ─── Etsy API types (partial) ─────────────────────────────────────────────────

interface EtsyReceiptsResponse {
  count:   number;
  results: EtsyReceipt[];
}

interface EtsyReceipt {
  receipt_id:        number;
  receipt_type:      number;   // 0 = sale
  status:            string;   // "paid" | "completed" | "open" | "payment processing" | "canceled"
  is_shipped:        boolean;
  is_paid:           boolean;
  create_timestamp:  number;   // Unix seconds
  update_timestamp:  number;
  currency_code:     string;
  message_from_seller?: string;
  message_from_buyer?:  string;
  // Monetary fields — all strings in the Etsy v3 API
  grandtotal:        EtsyMoney;
  subtotal:          EtsyMoney;
  total_price:       EtsyMoney;
  total_shipping_cost: EtsyMoney;
  total_tax_cost:    EtsyMoney;
  total_vat_cost?:   EtsyMoney;
  discount_amt:      EtsyMoney;
  gift_wrap_price?:  EtsyMoney;
  // Buyer
  buyer_user_id:     number;
  buyer_email?:      string;
  // Transactions (line items)
  transactions:      EtsyTransaction[];
  // Refunds
  refunds?:          EtsyRefund[];
  // Shipments
  shipments?:        { receipt_shipping_id: number; was_paid: boolean }[];
}

interface EtsyMoney {
  amount:   number;   // integer, in minor units (cents)
  divisor:  number;   // e.g. 100 for USD
  currency_code: string;
}

interface EtsyTransaction {
  transaction_id:  number;
  listing_id?:     number;
  product_id?:     number;
  sku?:            string;
  title:           string;
  quantity:        number;
  price:           EtsyMoney;
  shipping_cost?:  EtsyMoney;
}

interface EtsyRefund {
  amount:         EtsyMoney;
  created_timestamp: number;
  reason?:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert an EtsyMoney object to a plain float. */
function toFloat(m: EtsyMoney | undefined | null): number {
  if (!m) return 0;
  return m.divisor > 0 ? m.amount / m.divisor : 0;
}

/** Map Etsy receipt status to our internal order status. */
function mapStatus(
  receipt: EtsyReceipt
): "fulfilled" | "pending" | "refunded" | "cancelled" {
  if (receipt.status === "canceled") return "cancelled";

  const hasRefunds = (receipt.refunds?.length ?? 0) > 0;
  if (hasRefunds) {
    const totalRefunded = (receipt.refunds ?? []).reduce(
      (sum, r) => sum + toFloat(r.amount),
      0
    );
    const grandTotal = toFloat(receipt.grandtotal);
    // Fully refunded → refunded; partially refunded → still fulfilled
    if (grandTotal > 0 && totalRefunded >= grandTotal * 0.99) return "refunded";
  }

  if (!receipt.is_paid) return "pending";
  return "fulfilled";
}

// ─── Upsert a single Etsy receipt as an Order ─────────────────────────────────

async function upsertOrder(
  receipt: EtsyReceipt,
  storeId: string,
  teamId:  string,
  storeCurrency: string,
) {
  const grossRevenue    = toFloat(receipt.grandtotal);
  const discounts       = toFloat(receipt.discount_amt);
  const shippingRevenue = toFloat(receipt.total_shipping_cost);
  const taxes           = toFloat(receipt.total_tax_cost) + toFloat(receipt.total_vat_cost);

  // Sum all refund amounts
  const refundAmount = (receipt.refunds ?? []).reduce(
    (sum, r) => sum + toFloat(r.amount),
    0
  );

  const currency = receipt.currency_code || storeCurrency;

  // Map transactions → line items
  const lineItems = receipt.transactions.map((tx) => {
    const unitPrice  = toFloat(tx.price);
    const qty        = tx.quantity ?? 1;
    return {
      productId:    tx.listing_id  ? String(tx.listing_id)  : undefined,
      sku:          tx.sku ?? undefined,
      name:         tx.title,
      quantity:     qty,
      price:        unitPrice,
      cogs:         0,   // filled in by COGS editor
      totalRevenue: unitPrice * qty,
      totalCogs:    0,
    };
  });

  const profit = calcOrderProfit({
    grossRevenue,
    discounts,
    shippingRevenue,
    shippingCost:     0,   // merchant shipping cost — unknown until user sets it
    totalCogs:        0,   // unknown until COGS are entered
    transactionFees:  0,   // Etsy transaction fee not returned in receipts API
    taxes,
    refundAmount,
    chargebackAmount: 0,
    adSpendAllocated: 0,
  });

  const status = mapStatus(receipt);

  await OrderModel.findOneAndUpdate(
    { storeId, externalId: String(receipt.receipt_id) },
    {
      storeId,
      teamId,
      externalId:       String(receipt.receipt_id),
      orderNumber:      String(receipt.receipt_id),
      orderDate:        new Date(receipt.create_timestamp * 1000),
      currency,
      grossRevenue,
      discounts,
      netRevenue:       profit.netRevenue,
      totalCogs:        0,
      shippingCost:     0,
      shippingRevenue,
      transactionFees:  0,
      taxes,
      refundAmount,
      chargebackAmount: 0,
      adSpendAllocated: 0,
      netProfit:        profit.netProfit,
      profitMargin:     profit.netMargin,
      lineItems,
      customerId:       String(receipt.buyer_user_id),
      customerEmail:    receipt.buyer_email,
      isFirstOrder:     false, // Etsy receipts API doesn't expose order history count
      status,
      importedFrom:     "api",
    },
    { upsert: true }
  );
}
