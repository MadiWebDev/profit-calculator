import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { LtvClient } from "./LtvClient";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function getLtvData(teamId: string) {
  await connectDB();
  const teamOid = new mongoose.Types.ObjectId(teamId);
  const now = new Date();

  // ── Per-customer lifetime aggregation ────────────────────────────────────
  const [customerData, monthlyTrend, orderFrequency] = await Promise.all([

    // Full per-customer lifetime stats (all non-cancelled with email)
    OrderModel.aggregate([
      {
        $match: {
          teamId: teamOid,
          status: { $ne: "cancelled" },
          customerEmail: { $exists: true, $nin: [null, ""] },
        },
      },
      { $sort: { orderDate: 1 } },
      {
        $group: {
          _id: "$customerEmail",
          firstOrderDate: { $first: "$orderDate" },
          lastOrderDate:  { $last:  "$orderDate" },
          orderCount:     { $sum: 1 },
          totalRevenue:   { $sum: "$netRevenue" },
          totalProfit:    { $sum: "$netProfit" },
          totalCogs:      { $sum: "$totalCogs" },
          totalAdSpend:   { $sum: "$adSpendAllocated" },
          avgOrderValue:  { $avg: "$netRevenue" },
        },
      },
    ]),

    // Monthly new customers + revenue trend (last 12 months)
    OrderModel.aggregate([
      {
        $match: {
          teamId: teamOid,
          status: { $ne: "cancelled" },
          customerEmail: { $exists: true, $nin: [null, ""] },
          orderDate: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) },
        },
      },
      { $sort: { orderDate: 1 } },
      {
        $group: {
          _id: {
            email: "$customerEmail",
            month: { $dateToString: { format: "%Y-%m", date: "$orderDate" } },
          },
          revenue: { $sum: "$netRevenue" },
          profit:  { $sum: "$netProfit" },
          orders:  { $sum: 1 },
          firstEver: { $first: "$orderDate" },
        },
      },
      {
        $group: {
          _id: "$_id.month",
          totalRevenue:    { $sum: "$revenue" },
          totalProfit:     { $sum: "$profit" },
          activeCustomers: { $sum: 1 },
          totalOrders:     { $sum: "$orders" },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Order-frequency distribution (how many customers placed 1, 2, 3+ orders)
    OrderModel.aggregate([
      {
        $match: {
          teamId: teamOid,
          status: { $ne: "cancelled" },
          customerEmail: { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$customerEmail", count: { $sum: 1 } } },
      {
        $bucket: {
          groupBy: "$count",
          boundaries: [1, 2, 3, 4, 6, 11],
          default: "many",
          output: { customers: { $sum: 1 } },
        },
      },
    ]),
  ]);

  // ── Build cohort table ────────────────────────────────────────────────────
  const cohortMap = new Map<string, {
    cohort: string; customers: number; revenue: number; profit: number;
    repeatCustomers: number; totalOrders: number;
  }>();

  for (const c of customerData) {
    const cohort = (c.firstOrderDate as Date).toISOString().slice(0, 7);
    const cur = cohortMap.get(cohort) ?? {
      cohort, customers: 0, revenue: 0, profit: 0,
      repeatCustomers: 0, totalOrders: 0,
    };
    cur.customers++;
    cur.revenue      += c.totalRevenue as number;
    cur.profit       += c.totalProfit  as number;
    cur.totalOrders  += c.orderCount   as number;
    if ((c.orderCount as number) > 1) cur.repeatCustomers++;
    cohortMap.set(cohort, cur);
  }

  const cohorts = Array.from(cohortMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, c]) => ({
      cohort:               c.cohort,
      customers:            c.customers,
      revenue:              round2(c.revenue),
      profit:               round2(c.profit),
      repeatCustomers:      c.repeatCustomers,
      repeatRate:           round2(c.customers > 0 ? (c.repeatCustomers / c.customers) * 100 : 0),
      avgLtv:               round2(c.customers > 0 ? c.profit / c.customers : 0),
      avgRevPerCustomer:    round2(c.customers > 0 ? c.revenue / c.customers : 0),
      avgOrdersPerCustomer: round2(c.customers > 0 ? c.totalOrders / c.customers : 0),
    }));

  // ── Top customers ─────────────────────────────────────────────────────────
  const daysBetween = (a: Date, b: Date) =>
    Math.max(1, Math.floor((b.getTime() - a.getTime()) / 864e5));

  const topCustomers = [...customerData]
    .sort((a, b) => (b.totalProfit as number) - (a.totalProfit as number))
    .slice(0, 25)
    .map((c) => {
      const first  = c.firstOrderDate as Date;
      const last   = c.lastOrderDate  as Date;
      const days   = daysBetween(first, last);
      const orders = c.orderCount as number;
      // Days since last order — proxy for churn risk
      const daysSinceLast = daysBetween(last, now);
      // Estimated annual LTV based on order frequency
      const ordersPerDay = orders / Math.max(days, 1);
      const estimatedAnnualLtv = ordersPerDay * 365 * ((c.totalProfit as number) / orders);

      return {
        email:               c._id as string,
        orderCount:          orders,
        totalRevenue:        round2(c.totalRevenue as number),
        totalProfit:         round2(c.totalProfit  as number),
        avgOrderValue:       round2(c.avgOrderValue as number),
        firstOrderDate:      first.toISOString(),
        lastOrderDate:       last.toISOString(),
        daysSinceFirst:      daysBetween(first, now),
        daysSinceLast,
        estimatedAnnualLtv:  round2(estimatedAnnualLtv),
        // Churn risk: >90 days since last order & had multiple orders
        churnRisk: (daysSinceLast > 90 && orders > 1 ? "high"
                   : daysSinceLast > 60 && orders > 1 ? "medium"
                   : "low") as "low" | "medium" | "high",
      };
    });

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalCustomers   = customerData.length;
  const repeatCustomers  = customerData.filter((c) => (c.orderCount as number) > 1).length;
  const repeatRate       = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
  const totalProfit      = customerData.reduce((s, c) => s + (c.totalProfit as number), 0);
  const totalRevenue     = customerData.reduce((s, c) => s + (c.totalRevenue as number), 0);
  const avgLtv           = totalCustomers > 0 ? totalProfit / totalCustomers : 0;
  const avgRevLtv        = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const avgOrdersPerCust = totalCustomers > 0
    ? customerData.reduce((s, c) => s + (c.orderCount as number), 0) / totalCustomers
    : 0;

  // High-value segment (top 20% of customers by profit)
  const sortedByProfit = [...customerData].sort((a, b) => (b.totalProfit as number) - (a.totalProfit as number));
  const top20pctCount  = Math.max(1, Math.ceil(totalCustomers * 0.2));
  const top20pctRevenue = sortedByProfit.slice(0, top20pctCount).reduce((s, c) => s + (c.totalRevenue as number), 0);
  const top20pctPct    = totalRevenue > 0 ? (top20pctRevenue / totalRevenue) * 100 : 0;

  // Churn risk count
  const atRiskCount = topCustomers.filter((c) => c.churnRisk !== "low").length;

  // ── Monthly trend ─────────────────────────────────────────────────────────
  const trend = (monthlyTrend as Array<{
    _id: string; totalRevenue: number; totalProfit: number;
    activeCustomers: number; totalOrders: number;
  }>).map((m) => ({
    month:           m._id,
    revenue:         round2(m.totalRevenue),
    profit:          round2(m.totalProfit),
    activeCustomers: m.activeCustomers,
    avgOrderValue:   round2(m.activeCustomers > 0 ? m.totalRevenue / m.totalOrders : 0),
  }));

  // ── Frequency distribution ────────────────────────────────────────────────
  const freqLabels: Record<string | number, string> = {
    1: "1 order", 2: "2 orders", 3: "3 orders", 4: "4–5 orders",
    6: "6–10 orders", many: "11+ orders",
  };
  const frequency = (orderFrequency as Array<{ _id: number | string; customers: number }>).map((b) => ({
    label:     freqLabels[b._id] ?? String(b._id),
    customers: b.customers,
    pct:       round2(totalCustomers > 0 ? (b.customers / totalCustomers) * 100 : 0),
  }));

  return {
    cohorts,
    topCustomers,
    trend,
    frequency,
    summary: {
      totalCustomers,
      repeatCustomers,
      repeatRate:         round2(repeatRate),
      avgLtv:             round2(avgLtv),
      avgRevLtv:          round2(avgRevLtv),
      avgOrdersPerCust:   round2(avgOrdersPerCust),
      top20pctPct:        round2(top20pctPct),
      atRiskCount,
    },
  };
}

export default async function LtvPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const user = session.user as { teamId?: string };
  if (!user.teamId) redirect("/onboarding");

  const data = await getLtvData(user.teamId);
  return <LtvClient data={data} />;
}
