import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import ProfitGoalModel from "@/models/ProfitGoal";
import OrderModel from "@/models/Order";
import { GoalsClient } from "./GoalsClient";

async function getGoalsData(teamId: string) {
  await connectDB();

  const goals = await ProfitGoalModel.find({ teamId }).sort({ month: -1 }).lean();

  // Compute current month progress for each goal
  const enriched = await Promise.all(
    goals.map(async (g) => {
      const [year, month] = g.month.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);

      const agg = await OrderModel.aggregate([
        {
          $match: {
            teamId: require("mongoose").Types.ObjectId.createFromHexString(teamId),
            orderDate: { $gte: start, $lte: end },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            profit: { $sum: "$netProfit" },
            revenue: { $sum: "$netRevenue" },
          },
        },
      ]);

      const currentProfit = agg[0]?.profit ?? 0;
      const currentRevenue = agg[0]?.revenue ?? 0;
      const progressPercent = g.targetProfit > 0
        ? Math.min(100, (currentProfit / g.targetProfit) * 100)
        : 0;

      return {
        id: g._id.toString(),
        month: g.month,
        targetProfit: g.targetProfit,
        targetRevenue: g.targetRevenue,
        currentProfit,
        currentRevenue,
        progressPercent,
        currency: g.currency,
        alertsEnabled: g.alerts?.enabled ?? false,
        alertEmail: g.alerts?.email ?? true,
        alertThreshold: g.alerts?.profitBelowPercent ?? 70,
      };
    })
  );

  return enriched;
}

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) redirect("/onboarding");

  const goals = await getGoalsData(teamId);
  return <GoalsClient goals={goals} />;
}
