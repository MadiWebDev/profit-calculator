import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

// ── GET /api/orders/[id] ──────────────────────────────────────────────────────
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { id } = await params;

  await connectDB();
  const order = await OrderModel.findOne({ _id: id, teamId: user.teamId }).lean();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    order: {
      id: order._id.toString(),
      externalId: order.externalId,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate.toISOString(),
      currency: order.currency,
      status: order.status,
      grossRevenue: order.grossRevenue,
      discounts: order.discounts,
      netRevenue: order.netRevenue,
      totalCogs: order.totalCogs,
      shippingCost: order.shippingCost,
      shippingRevenue: order.shippingRevenue,
      transactionFees: order.transactionFees,
      taxes: order.taxes,
      refundAmount: order.refundAmount,
      chargebackAmount: order.chargebackAmount,
      adSpendAllocated: order.adSpendAllocated,
      netProfit: order.netProfit,
      profitMargin: order.profitMargin,
      customerEmail: order.customerEmail,
      itemCount: order.lineItems?.length ?? 0,
    },
  });
}

// ── PATCH /api/orders/[id] ────────────────────────────────────────────────────
// Allows updating editable fields. Recomputes netProfit / profitMargin if any
// revenue or cost field changes.
// Only owner / admin / member may edit orders.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string; role?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { id } = await params;
  const body = await req.json();

  await connectDB();
  const order = await OrderModel.findOne({ _id: id, teamId: user.teamId });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fields that, if changed, require profit recomputation
  const MONETARY_FIELDS = [
    "grossRevenue", "discounts", "shippingRevenue", "shippingCost",
    "totalCogs", "transactionFees", "taxes", "refundAmount",
    "chargebackAmount", "adSpendAllocated",
  ] as const;

  const OTHER_FIELDS = ["orderNumber", "orderDate", "currency", "status", "customerEmail"] as const;

  let needsRecompute = false;

  for (const field of MONETARY_FIELDS) {
    if (body[field] !== undefined) {
      const val = Number(body[field]);
      if (!isNaN(val) && val >= 0) {
        order.set(field, val);
        needsRecompute = true;
      }
    }
  }

  for (const field of OTHER_FIELDS) {
    if (body[field] !== undefined) {
      if (field === "orderDate") {
        const d = new Date(body[field]);
        if (!isNaN(d.getTime())) order.set(field, d);
      } else if (field === "status") {
        const valid = ["pending", "fulfilled", "refunded", "cancelled"];
        if (valid.includes(body[field])) order.set(field, body[field]);
      } else {
        order.set(field, body[field]);
      }
    }
  }

  if (needsRecompute) {
    const profit = calcOrderProfit({
      grossRevenue: order.grossRevenue,
      discounts: order.discounts,
      shippingRevenue: order.shippingRevenue,
      shippingCost: order.shippingCost,
      totalCogs: order.totalCogs,
      transactionFees: order.transactionFees,
      taxes: order.taxes,
      refundAmount: order.refundAmount,
      chargebackAmount: order.chargebackAmount,
      adSpendAllocated: order.adSpendAllocated,
    });
    order.netRevenue = profit.netRevenue;
    order.netProfit = profit.netProfit;
    order.profitMargin = profit.netMargin;
  }

  await order.save();

  await logAudit({
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id!),
    action: "order.updated",
    description: `Updated order ${order.orderNumber ?? order.externalId} — net profit $${order.netProfit}`,
    resourceType: "Order",
    resourceId: id,
  });

  return NextResponse.json({ success: true });
}

// ── DELETE /api/orders/[id] ───────────────────────────────────────────────────
// Hard-deletes the order. Only owner / admin may delete.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string; role?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { id } = await params;

  await connectDB();
  const order = await OrderModel.findOne({ _id: id, teamId: user.teamId });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const label = order.orderNumber ?? order.externalId;
  await order.deleteOne();

  await logAudit({
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id!),
    action: "order.deleted",
    description: `Deleted order ${label}`,
    resourceType: "Order",
    resourceId: id,
  });

  return NextResponse.json({ success: true });
}
