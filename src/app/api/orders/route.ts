import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import TeamModel from "@/models/Team";
import { normalizeCurrencyCode, resolveOrderCurrency } from "@/lib/money-currency";
import { formatCurrency } from "@/lib/utils";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import { isoDateTimeField } from "@/lib/dates";

const Money = z.number().min(0).max(1_000_000_000).default(0);

const CreateOrderSchema = z
  .object({
    orderNumber: z.string().trim().max(100).optional(),
    // The order form sends a calendar date ("2026-11-11") from
    // <input type="date">; isoDateTimeField normalizes it to midnight
    // UTC so the strict ISO datetime check does not reject manual orders.
    orderDate: isoDateTimeField,
    status: z.enum(["pending", "fulfilled", "refunded", "cancelled"]).default("fulfilled"),
    grossRevenue: z.number().min(0).max(1_000_000_000),
    discounts: Money,
    shippingRevenue: Money,
    shippingCost: Money,
    totalCogs: Money,
    transactionFees: Money,
    taxes: Money,
    refundAmount: Money,
    chargebackAmount: Money,
    adSpendAllocated: Money,
    customerEmail: z.email().max(254).optional(),
    // Optional on the wire: the form sends it, but when absent the
    // server derives it from the session (user display > team > store
    // — see below). Never a silent USD default.
    currency: z.string().trim().length(3).toUpperCase().optional(),
  })
  .strict();

// ── POST /api/orders ──────────────────────────────────────────────────────────
// Creates a single manual order.
export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "orders-post", permission: "write:data" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, CreateOrderSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;

  // Plan limit: monthly orders
  const ent = await checkEntitlement(session.teamId, "orders.import", { count: 1 });
  if ("response" in ent) return ent.response;

  const profit = calcOrderProfit({
    grossRevenue: b.grossRevenue,
    discounts: b.discounts,
    shippingRevenue: b.shippingRevenue,
    shippingCost: b.shippingCost,
    totalCogs: b.totalCogs,
    transactionFees: b.transactionFees,
    taxes: b.taxes,
    refundAmount: b.refundAmount,
    chargebackAmount: b.chargebackAmount,
    adSpendAllocated: b.adSpendAllocated,
  });

  try {
    await connectDB();

    // Find or create the manual-entry store for this team
    let store = await StoreModel.findOne({
      teamId: toObjectId(session.teamId),
      platform: "csv_manual",
      name: "Manual Entry",
    });

    // No money without an explicit currency: the sent value wins, else
    // the currency the user was working in (their locked display
    // currency), then the team's, then the store's. If none of those
    // yields a usable code the write is rejected — never stored as USD.
    const team = await TeamModel.findById(session.teamId).select("currency").lean();
    const currency = resolveOrderCurrency({
      sent: b.currency,
      user: session.displayCurrency,
      team: team?.currency,
      store: store?.currency,
    });
    if (!currency) {
      return fail(
        "Currency is required — pick a currency for this order",
        400,
        "ORDER_CURRENCY_MISSING"
      );
    }

    if (!store) {
      const storeEnt = await checkEntitlement(session.teamId, "stores.connect");
      if ("response" in storeEnt) return storeEnt.response;
      // A manual store has no currency of its own: it takes the currency
      // the user was working in, so it never silently becomes USD (and
      // never votes USD in the derivation's store step).
      store = await StoreModel.create({
        teamId: toObjectId(session.teamId),
        name: "Manual Entry",
        platform: "csv_manual",
        currency,
        syncStatus: "idle",
        isActive: true,
      });
    } else if (!normalizeCurrencyCode(store.currency)) {
      // A store created before the model default was removed may have no
      // usable currency; stamp the one the user was working in.
      store.currency = currency;
      await store.save();
    }

    const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const order = await OrderModel.create({
      storeId: store._id,
      teamId: toObjectId(session.teamId),
      externalId,
      orderNumber: b.orderNumber || externalId,
      orderDate: new Date(b.orderDate),
      currency,
      grossRevenue: b.grossRevenue,
      discounts: b.discounts,
      netRevenue: profit.netRevenue,
      totalCogs: b.totalCogs,
      shippingCost: b.shippingCost,
      shippingRevenue: b.shippingRevenue,
      transactionFees: b.transactionFees,
      taxes: b.taxes,
      refundAmount: b.refundAmount,
      chargebackAmount: b.chargebackAmount,
      adSpendAllocated: b.adSpendAllocated,
      netProfit: profit.netProfit,
      profitMargin: profit.netMargin,
      customerEmail: b.customerEmail,
      status: b.status,
      importedFrom: "api",
    });

    try {
      await logAudit({
        teamId: toObjectId(session.teamId),
        userId: toObjectId(session.userId),
        action: "order.imported",
        description: `Created manual order ${b.orderNumber || externalId} — revenue ${formatCurrency(b.grossRevenue, currency)}, net profit ${formatCurrency(profit.netProfit, currency)}`,
        resourceType: "Order",
        resourceId: order._id.toString(),
        metadata: { grossRevenue: b.grossRevenue, netProfit: profit.netProfit, status: b.status, currency },
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json(
      {
        order: {
          id: order._id.toString(),
          externalId: order.externalId,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate.toISOString(),
          status: order.status,
          currency: order.currency,
          grossRevenue: order.grossRevenue,
          netRevenue: order.netRevenue,
          totalCogs: order.totalCogs,
          netProfit: order.netProfit,
          profitMargin: order.profitMargin,
          adSpendAllocated: order.adSpendAllocated,
          refundAmount: order.refundAmount,
          customerEmail: order.customerEmail,
          itemCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error("manual order create failed", toLogError(err), { teamId: session.teamId });
    return fail("Failed to create order", 500, "ORDER_CREATE_FAILED");
  }
}
