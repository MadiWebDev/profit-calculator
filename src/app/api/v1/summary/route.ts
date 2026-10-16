/**
 * Public API v1 — Profit summary endpoint
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireV1Access } from "@/lib/api-key-auth";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { normalizeReportOrders } from "@/lib/reporting";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  const result = await requireV1Access(req, "read:reports");
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { searchParams } = req.nextUrl;
  const from = new Date(searchParams.get("from") ?? new Date(Date.now() - 30 * 864e5).toISOString());
  const to   = new Date(searchParams.get("to")   ?? new Date().toISOString());

  await connectDB();
  const orders = await OrderModel.find({
    teamId: mongoose.Types.ObjectId.createFromHexString(session.teamId),
    orderDate: { $gte: from, $lte: to },
    status: { $ne: "cancelled" },
  }).lean();

  const report = await normalizeReportOrders(orders.map((o) => ({
    currency: o.currency,
    grossRevenue: o.grossRevenue, discounts: o.discounts,
    shippingRevenue: o.shippingRevenue, shippingCost: o.shippingCost,
    totalCogs: o.totalCogs, transactionFees: o.transactionFees,
    taxes: o.taxes, refundAmount: o.refundAmount,
    chargebackAmount: o.chargebackAmount, adSpendAllocated: o.adSpendAllocated,
  })), session.teamId);
  const summary = report.summary;

  return NextResponse.json({ data: summary, currency: report.baseCurrency, period: { from: from.toISOString(), to: to.toISOString() } });
}
