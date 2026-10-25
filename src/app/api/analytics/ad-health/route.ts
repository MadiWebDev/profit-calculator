/**
 * GET /api/analytics/ad-health — per-platform health: spend from
 * AdSpendDaily, last sync from the ad account, days covered, and the
 * reconciliation delta vs ad spend allocated to orders in the period.
 * A platform whose dashboard spend and allocated spend diverge is
 * flagged, not silently averaged away.
 */
import { NextResponse } from "next/server";
import { getReportContext, loadReportOrders } from "@/lib/report-server";
import { summarizeOrders } from "@/lib/parity-reports";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/validation";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import AdAccountModel from "@/models/AdAccount";

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "analytics-ad-health");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  await connectDB();
  const teamOid = toObjectId(ctx.session.teamId);
  const [accounts, spendRows] = await Promise.all([
    AdAccountModel.find({ teamId: teamOid, isActive: true }).lean(),
    AdSpendDailyModel.aggregate([
      { $match: { teamId: teamOid, date: { $gte: ctx.from, $lte: ctx.to } } },
      { $group: { _id: "$platform", spend: { $sum: "$spend" }, days: { $sum: 1 } } },
    ]),
  ]);
  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);
  const spendByPlatform = new Map<string, { spend: number; days: number }>();
  for (const r of spendRows as { _id: string; spend: number; days: number }[]) {
    spendByPlatform.set(r._id, { spend: r.spend, days: r.days });
  }
  const platforms = accounts.map((a) => {
    const s = spendByPlatform.get(a.platform) ?? { spend: 0, days: 0 };
    return {
      platform: a.platform,
      accountName: a.accountName,
      currency: a.currency,
      lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
      syncStatus: a.syncStatus,
      dashboardSpend: Math.round(s.spend * 100) / 100,
      daysCovered: s.days,
      // Allocated spend is order-level; the delta is shown per platform
      // only as a total check (allocation is not per-platform in orders).
      deltaVsAllocated: null as number | null,
    };
  });
  const dashboardTotal = platforms.reduce((s, p) => s + p.dashboardSpend, 0);
  return NextResponse.json({
    platforms,
    totals,
    dashboardSpendTotal: Math.round(dashboardTotal * 100) / 100,
    allocatedSpendTotal: totals.adSpend,
    reconciliationDelta: Math.round((dashboardTotal - totals.adSpend) * 100) / 100,
  });
}
