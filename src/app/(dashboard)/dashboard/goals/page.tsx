import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Types } from "mongoose";
import ProfitGoalModel from "@/models/ProfitGoal";
import OrderModel from "@/models/Order";
import { GoalsClient } from "./GoalsClient";
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";

async function getGoalsData(teamId: string) {
  await connectDB();

  const goals = await ProfitGoalModel.find({ teamId }).sort({ month: -1 }).lean();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayUtc = now.toISOString().slice(0, 10);

  // Compute current month progress for each goal
  const enriched = await Promise.all(
    goals.map(async (g) => {
      const [year, month] = g.month.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      // Guard: an invalid teamId must match nothing rather than throw.
      const teamObjectId = Types.ObjectId.isValid(teamId)
        ? Types.ObjectId.createFromHexString(teamId)
        : null;

      // The target is denominated in the goal's own currency, so
      // progress must compare like with like: current profit/revenue
      // converted INTO the goal's currency. A raw Mongo $sum cannot
      // convert, and multi-currency teams were counted 1:1.
      const goalCurrency = (g.currency ?? "").toUpperCase().trim() || null;
      const storeId = g.storeId ? g.storeId.toString() : undefined;

      // The goal-alerts cron (jobGoalAlerts) converts each order into
      // the report base and stores currentProfit/currentRevenue. Those
      // stored values are usable only for the current month, only when
      // the cron ran today, and only after converting them from the
      // report base into the goal's currency — the cron's stored
      // progressPercent itself divides base-currency current by a
      // goal-currency target, so it is never trusted as-is.
      let currentProfit: number | null = null;
      let currentRevenue: number | null = null;
      if (g.month === currentMonth && typeof g.currentProfit === "number" && typeof g.currentRevenue === "number") {
        const updatedAt = g.updatedAt ? new Date(g.updatedAt).toISOString().slice(0, 10) : null;
        if (updatedAt === todayUtc) {
          const reportBase = await getReportBaseCurrency(teamId, storeId);
          const target = goalCurrency ?? reportBase;
          const rates = await getReportRates(reportBase, teamId);
          currentProfit = convertAmount(g.currentProfit, reportBase, target, rates);
          currentRevenue = convertAmount(g.currentRevenue, reportBase, target, rates);
        }
      }

      if (currentProfit === null || currentRevenue === null) {
        // Missing or stale stored values (including every past month,
        // which the cron never refreshes): recompute from the orders,
        // converting each one into the goal's currency exactly the way
        // the cron converts into the report base.
        const target = goalCurrency ?? (await getReportBaseCurrency(teamId, storeId));
        const rates = await getReportRates(target, teamId);
        const match: Record<string, unknown> = {
          teamId: teamObjectId,
          orderDate: { $gte: start, $lte: end },
          status: { $ne: "cancelled" },
        };
        if (g.storeId) match.storeId = g.storeId;
        const goalOrders = await OrderModel.find(match)
          .select("currency netProfit netRevenue")
          .lean();
        currentProfit = 0;
        currentRevenue = 0;
        for (const o of goalOrders) {
          currentProfit += convertAmount(o.netProfit ?? 0, o.currency, target, rates);
          currentRevenue += convertAmount(o.netRevenue ?? 0, o.currency, target, rates);
        }
      }

      const progressPercent = g.targetProfit > 0
        ? Math.min(100, (currentProfit / g.targetProfit) * 100)
        : 0;

      return {
        id: g._id.toString(),
        month: g.month,
        targetProfit: g.targetProfit,
        targetRevenue: g.targetRevenue,
        currentProfit: Math.round(currentProfit * 100) / 100,
        currentRevenue: Math.round(currentRevenue * 100) / 100,
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
