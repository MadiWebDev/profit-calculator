import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { AdSpendClient } from "./AdSpendClient";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

async function getAdData(teamId: string, days = 30) {
  await connectDB();
  const teamOid = mongoose.Types.ObjectId.createFromHexString(teamId);
  const from = new Date(Date.now() - days * 864e5);

  const [byPlatform, byDay, byCampaign] = await Promise.all([
    AdSpendDailyModel.aggregate([
      { $match: { teamId: teamOid, date: { $gte: from } } },
      { $group: {
        _id: "$platform",
        spend: { $sum: "$spend" },
        revenue: { $sum: "$revenueAttributed" },
        conversions: { $sum: "$conversions" },
        impressions: { $sum: "$impressions" },
        clicks: { $sum: "$clicks" },
        profitAttributed: { $sum: "$profitAttributed" },
      }},
    ]),
    AdSpendDailyModel.aggregate([
      { $match: { teamId: teamOid, date: { $gte: from } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        spend: { $sum: "$spend" },
        revenue: { $sum: "$revenueAttributed" },
        conversions: { $sum: "$conversions" },
      }},
      { $sort: { _id: 1 } },
    ]),
    AdSpendDailyModel.aggregate([
      { $match: { teamId: teamOid, date: { $gte: from }, campaignId: { $exists: true } } },
      { $group: {
        _id: { platform: "$platform", campaignId: "$campaignId", campaignName: "$campaignName" },
        spend: { $sum: "$spend" },
        revenue: { $sum: "$revenueAttributed" },
        conversions: { $sum: "$conversions" },
        profitAttributed: { $sum: "$profitAttributed" },
      }},
      { $sort: { spend: -1 } },
      { $limit: 30 },
    ]),
  ]);

  const totalSpend   = byPlatform.reduce((s: number, p: { spend: number }) => s + p.spend, 0);
  const totalRevenue = byPlatform.reduce((s: number, p: { revenue: number }) => s + p.revenue, 0);
  const totalConv    = byPlatform.reduce((s: number, p: { conversions: number }) => s + p.conversions, 0);
  const overallRoas  = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return {
    summary: { totalSpend, totalRevenue, totalConversions: totalConv, overallRoas },
    byPlatform: byPlatform as { _id: string; spend: number; revenue: number; conversions: number; impressions: number; clicks: number; profitAttributed: number }[],
    byDay: byDay as { _id: string; spend: number; revenue: number; conversions: number }[],
    byCampaign: byCampaign as { _id: { platform: string; campaignId: string; campaignName: string }; spend: number; revenue: number; conversions: number; profitAttributed: number }[],
  };
}

export default async function AdSpendPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const user = session.user as { teamId?: string };
  if (!user.teamId) redirect("/onboarding");

  const data = await getAdData(user.teamId, 30);
  return <AdSpendClient data={data} />;
}
