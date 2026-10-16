import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";

const Money = z.number().min(0).max(1_000_000_000).default(0);

const CreateOrderSchema = z
  .object({
    orderNumber: z.string().trim().max(100).optional(),
    orderDate: z.iso.datetime(),
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
    currency: z.string().length(3).toUpperCase().default("USD"),
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
    if (!store) {
      const storeEnt = await checkEntitlement(session.teamId, "stores.connect");
      if ("response" in storeEnt) return storeEnt.response;
      store = await StoreModel.create({
        teamId: toObjectId(session.teamId),
        name: "Manual Entry",
        platform: "csv_manual",
        syncStatus: "idle",
        isActive: true,
      });
    }

    const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const order = await OrderModel.create({
      storeId: store._id,
      teamId: toObjectId(session.teamId),
      externalId,
      orderNumber: b.orderNumber || externalId,
      orderDate: new Date(b.orderDate),
      currency: b.currency,
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
        description: `Created manual order ${b.orderNumber || externalId} — revenue $${b.grossRevenue}, net profit $${profit.netProfit}`,
        resourceType: "Order",
        resourceId: order._id.toString(),
        metadata: { grossRevenue: b.grossRevenue, netProfit: profit.netProfit, status: b.status },
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
