import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { LtvClient } from "./LtvClient";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

async function getLtvData(teamId: string) {
  await connectDB();
  const teamOid = mongoose.Types.ObjectId.createFromHexString(teamId);

  // Aggregate per-customer lifetime data
  const customerData = await OrderModel.aggregate([
    { $match: { teamId: teamOid, status: { $ne: "cancelled" }, customerEmail: { $exists: true, $ne: null } } },
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
        avgOrderValue:  { $avg: "$netRevenue" },
      },
    },
  ]);

  // Build cohort table (by first-order month)
  const cohortMap = new Map<string, {
    cohort: string; customers: number; revenue: number; profit: number;
    repeatCustomers: number; avgOrdersPerCustomer: number; avgLtv: number;
  }>();

  for (const c of customerData) {
    const cohort = (c.firstOrderDate as Date).toISOString().slice(0, 7);
    const cur = cohortMap.get(cohort) ?? {
      cohort, customers: 0, revenue: 0, profit: 0,
      repeatCustomers: 0, avgOrdersPerCustomer: 0, avgLtv: 0,
    };
    cur.customers++;
    cur.revenue  += c.totalRevenue;
    cur.profit   += c.totalProfit;
    if (c.orderCount > 1) cur.repeatCustomers++;
    cohortMap.set(cohort, cur);
  }

  const cohorts = Array.from(cohortMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, c]) => ({
      ...c,
      avgLtv:                c.customers > 0 ? c.profit / c.customers : 0,
      avgOrdersPerCustomer:  c.customers > 0 ? (cohortMap.get(c.cohort)?.customers ?? 1) : 1,
      repeatRate:            c.customers > 0 ? (c.repeatCustomers / c.customers) * 100 : 0,
      avgRevPerCustomer:     c.customers > 0 ? c.revenue / c.customers : 0,
    }));

  // Top customers by LTV
  const topCustomers = [...customerData]
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 20)
    .map((c) => ({
      email:          c._id as string,
      orderCount:     c.orderCount as number,
      totalRevenue:   c.totalRevenue as number,
      totalProfit:    c.totalProfit as number,
      avgOrderValue:  c.avgOrderValue as number,
      firstOrderDate: (c.firstOrderDate as Date).toISOString(),
      lastOrderDate:  (c.lastOrderDate  as Date).toISOString(),
      daysSinceFirst: Math.floor(((c.lastOrderDate as Date).getTime() - (c.firstOrderDate as Date).getTime()) / 864e5),
    }));

  // Summary stats
  const totalCustomers   = customerData.length;
  const repeatCustomers  = customerData.filter((c) => c.orderCount > 1).length;
  const repeatRate       = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
  const avgLtv           = totalCustomers > 0 ? customerData.reduce((s, c) => s + c.totalProfit, 0) / totalCustomers : 0;
  const avgOrdersPerCust = totalCustomers > 0 ? customerData.reduce((s, c) => s + c.orderCount, 0) / totalCustomers : 0;

  return { cohorts, topCustomers, summary: { totalCustomers, repeatCustomers, repeatRate, avgLtv, avgOrdersPerCust } };
}

export default async function LtvPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const user = session.user as { teamId?: string };
  if (!user.teamId) redirect("/onboarding");

  const data = await getLtvData(user.teamId);
  return <LtvClient data={data} />;
}
