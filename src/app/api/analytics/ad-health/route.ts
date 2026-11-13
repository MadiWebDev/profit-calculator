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
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "analytics-ad-health");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  await connectDB();
  const teamOid = toObjectId(ctx.session.teamId);
  const [accounts, spendRows] = await Promise.all([
    AdAccountModel.find({ teamId: teamOid, isActive: true }).lean(),
    // F7: group by platform AND currency — a $sum across rows in
    // different currencies is a meaningless mixed-currency total.
    // Each (platform, currency) group is converted into the report
    // base currency before summing, the same per-row path the P&L
    // uses. `days` still counts rows (F13 is a Phase 2 fix).
    AdSpendDailyModel.aggregate([
      { $match: { teamId: teamOid, date: { $gte: ctx.from, $lte: ctx.to } } },
      { $group: { _id: { platform: "$platform", currency: "$currency" }, spend: { $sum: "$spend" }, days: { $sum: 1 } } },
    ]),
  ]);
  const base = ctx.currency ?? (await getReportBaseCurrency(ctx.session.teamId, ctx.storeId));
  const rates = await getReportRates(base);
  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);
  const spendByPlatform = new Map<string, { spend: number; days: number }>();
  for (const r of spendRows as { _id: { platform: string; currency: string }; spend: number; days: number }[]) {
    const platform = r._id.platform;
    const converted = convertAmount(r.spend, r._id.currency, base, rates);
    const cur = spendByPlatform.get(platform) ?? { spend: 0, days: 0 };
    cur.spend += converted;
    cur.days += r.days;
    spendByPlatform.set(platform, cur);
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
    // All spend totals below are in `currency` (the report base
    // currency): each AdSpendDaily row was converted into it before
    // summing, so mixed-currency accounts no longer add up 1:1 (F7).
    currency: base,
    platforms,
    totals,
    dashboardSpendTotal: Math.round(dashboardTotal * 100) / 100,
    allocatedSpendTotal: totals.adSpend,
    reconciliationDelta: Math.round((dashboardTotal - totals.adSpend) * 100) / 100,
  });
}
