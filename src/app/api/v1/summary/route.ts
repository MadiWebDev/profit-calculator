/**
 * Public API v1 — Profit summary endpoint
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateApiKey, hasScope } from "@/lib/api-key-auth";
import { checkSubscription } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { calcPeriodSummary } from "@/lib/profit-engine";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  const session = await validateApiKey(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasScope(session, "read:reports")) {
    return NextResponse.json({ error: "Missing scope: read:reports" }, { status: 403 });
  }

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const { searchParams } = req.nextUrl;
  const from = new Date(searchParams.get("from") ?? new Date(Date.now() - 30 * 864e5).toISOString());
  const to   = new Date(searchParams.get("to")   ?? new Date().toISOString());

  await connectDB();
  const orders = await OrderModel.find({
    teamId: mongoose.Types.ObjectId.createFromHexString(session.teamId),
    orderDate: { $gte: from, $lte: to },
    status: { $ne: "cancelled" },
  }).lean();

  const summary = calcPeriodSummary(orders.map((o) => ({
    grossRevenue: o.grossRevenue, discounts: o.discounts,
    shippingRevenue: o.shippingRevenue, shippingCost: o.shippingCost,
    totalCogs: o.totalCogs, transactionFees: o.transactionFees,
    taxes: o.taxes, refundAmount: o.refundAmount,
    chargebackAmount: o.chargebackAmount, adSpendAllocated: o.adSpendAllocated,
  })));

  return NextResponse.json({ data: summary, period: { from: from.toISOString(), to: to.toISOString() } });
}
