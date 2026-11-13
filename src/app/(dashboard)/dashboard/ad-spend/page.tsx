import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { AdSpendClient } from "./AdSpendClient";
import mongoose from "mongoose";
import { convertAmount, getReportBaseCurrency, getReportRates } from "@/lib/report-currency";
import { parseAdSpendDays } from "@/lib/sync/ad-spend-days";

export const dynamic = "force-dynamic";

async function getAdData(teamId: string, days = 30) {
  await connectDB();
  const teamOid = mongoose.Types.ObjectId.createFromHexString(teamId);
  const from = new Date(Date.now() - days * 864e5);

  // F7: rows carry their provider account's currency, so a Mongo
  // $sum would add mixed currencies 1:1. Fetch the rows and convert
  // each one into the team base currency before grouping — the same
  // per-row path the P&L uses (pnl/page.tsx). Money fields (spend,
  // revenue, profit) convert; counts (impressions, clicks,
  // conversions) do not. profitAttributed is recomputed as
  // revenue − spend after conversion so the three stay consistent.
  const base = await getReportBaseCurrency(teamId);
  const rates = await getReportRates(base);
  const rows = await AdSpendDailyModel.find({
    teamId: teamOid,
    date: { $gte: from },
  })
    .select("platform date campaignId campaignName spend revenueAttributed conversions impressions clicks profitAttributed currency")
    .lean();

  interface Agg {
    spend: number; revenue: number; conversions: number;
    impressions: number; clicks: number; profitAttributed: number;
  }
  const zero = (): Agg => ({ spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0, profitAttributed: 0 });
  const byPlatform = new Map<string, Agg>();
  const byDay = new Map<string, Agg>();
  const byCampaign = new Map<string, Agg & { platform: string; campaignId: string; campaignName: string }>();
  for (const r of rows) {
    const conv = (v: number) => convertAmount(v ?? 0, r.currency, base, rates);
    const spend = conv(r.spend);
    const revenue = conv(r.revenueAttributed);
    const profit = revenue - spend;
    const add = (a: Agg) => {
      a.spend += spend;
      a.revenue += revenue;
      a.conversions += r.conversions ?? 0;
      a.impressions += r.impressions ?? 0;
      a.clicks += r.clicks ?? 0;
      a.profitAttributed += profit;
    };
    add(byPlatform.get(r.platform) ?? byPlatform.set(r.platform, zero()).get(r.platform)!);
    const day = (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().slice(0, 10);
    add(byDay.get(day) ?? byDay.set(day, zero()).get(day)!);
    if (r.campaignId) {
      const key = `${r.platform}\u0000${r.campaignId}\u0000${r.campaignName ?? ""}`;
      const existing = byCampaign.get(key) ?? {
        ...zero(), platform: r.platform, campaignId: r.campaignId, campaignName: r.campaignName ?? "",
      };
      add(existing);
      byCampaign.set(key, existing);
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const finish = (a: Agg): Agg => ({
    spend: r2(a.spend), revenue: r2(a.revenue), conversions: a.conversions,
    impressions: a.impressions, clicks: a.clicks, profitAttributed: r2(a.profitAttributed),
  });
  const platformRows = [...byPlatform.entries()].map(([platform, a]) => ({ _id: platform, ...finish(a) }));
  const dayRows = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([_id, a]) => ({ _id, ...finish(a) }));
  const campaignRows = [...byCampaign.values()]
    .map((a) => ({
      _id: { platform: a.platform, campaignId: a.campaignId, campaignName: a.campaignName },
      ...finish(a),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 30);

  const totalSpend   = platformRows.reduce((s, p) => s + p.spend, 0);
  const totalRevenue = platformRows.reduce((s, p) => s + p.revenue, 0);
  const totalConv    = platformRows.reduce((s, p) => s + p.conversions, 0);
  const overallRoas  = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return {
    summary: { totalSpend, totalRevenue, totalConversions: totalConv, overallRoas },
    byPlatform: platformRows,
    byDay: dayRows,
    byCampaign: campaignRows,
  };
}

interface Props {
  searchParams: Promise<{ days?: string }>;
}

export default async function AdSpendPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const user = session.user as { teamId?: string };
  if (!user.teamId) redirect("/onboarding");

  const params = await searchParams;
  // Only the offered ranges (30/60/90/120/150/180/365) are accepted;
  // anything else falls back to 30 instead of erroring.
  const days = parseAdSpendDays(params.days);
  const data = await getAdData(user.teamId, days);
  return <AdSpendClient data={data} days={days} />;
}
