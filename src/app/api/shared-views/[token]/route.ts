/** GET /api/shared-views/:token — public, read-only, expired links
 *  return 410. Returns only the view's KPI names and the team's
 *  last-30-day aggregates for those KPIs — never order-level data. */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import SavedViewModel from "@/models/SavedView";
import { summarizeOrders } from "@/lib/parity-reports";
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";
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
  // Shared-view KPIs sum order money; convert each order into the team
  // base currency first.
  const svBase = await getReportBaseCurrency(view.teamId);
  const svRates = await getReportRates(svBase);
  const totals = summarizeOrders(docs.map((o) => {
    const conv = (v?: number) => convertAmount(v ?? 0, o.currency, svBase, svRates);
    return {
      currency: svBase,
      grossRevenue: conv(o.grossRevenue), discounts: conv(o.discounts), shippingRevenue: conv(o.shippingRevenue),
      shippingCost: conv(o.shippingCost), totalCogs: conv(o.totalCogs), transactionFees: conv(o.transactionFees),
      taxes: conv(o.taxes), refundAmount: conv(o.refundAmount), chargebackAmount: conv(o.chargebackAmount),
      adSpendAllocated: conv(o.adSpendAllocated), otherCosts: conv(o.otherCosts), packagingCost: conv(o.packagingCost),
      codFee: conv(o.codFee), subscriptionShare: conv(o.subscriptionShare), rtoLoss: conv(o.rtoLoss),
      expenseAllocation: conv(o.expenseAllocation), orderDate: o.orderDate, status: o.status,
    };
  }));
  const values: Record<string, number> = {};
  for (const k of view.kpis) {
    if (k in totals) values[k] = totals[k as keyof typeof totals] as number;
  }
  return NextResponse.json({ name: view.name, kpis: view.kpis, values, period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } });
}
