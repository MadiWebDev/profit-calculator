/** GET /api/shared-views/:token — public, read-only, expired links
 *  return 410. Returns only the view's KPI names and the team's
 *  last-30-day aggregates for those KPIs — never order-level data. */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import SavedViewModel from "@/models/SavedView";
import { summarizeOrders } from "@/lib/parity-reports";
import OrderModel from "@/models/Order";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connectDB();
  const view = await SavedViewModel.findOne({ shareToken: token }).lean();
  if (!view) return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  if (view.shareExpiresAt && view.shareExpiresAt < new Date()) {
    return NextResponse.json({ error: "Share link expired" }, { status: 410 });
  }
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 864e5);
  const docs = await OrderModel.find({
    teamId: view.teamId, orderDate: { $gte: from, $lte: to }, status: { $ne: "cancelled" },
  }).lean();
  const totals = summarizeOrders(docs.map((o) => ({
    grossRevenue: o.grossRevenue ?? 0, discounts: o.discounts ?? 0, shippingRevenue: o.shippingRevenue ?? 0,
    shippingCost: o.shippingCost ?? 0, totalCogs: o.totalCogs ?? 0, transactionFees: o.transactionFees ?? 0,
    taxes: o.taxes ?? 0, refundAmount: o.refundAmount ?? 0, chargebackAmount: o.chargebackAmount ?? 0,
    adSpendAllocated: o.adSpendAllocated ?? 0, otherCosts: o.otherCosts ?? 0, packagingCost: o.packagingCost ?? 0,
    codFee: o.codFee ?? 0, subscriptionShare: o.subscriptionShare ?? 0, rtoLoss: o.rtoLoss ?? 0,
    expenseAllocation: o.expenseAllocation ?? 0, orderDate: o.orderDate, status: o.status,
  })));
  const values: Record<string, number> = {};
  for (const k of view.kpis) {
    if (k in totals) values[k] = totals[k as keyof typeof totals] as number;
  }
  return NextResponse.json({ name: view.name, kpis: view.kpis, values, period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } });
}
