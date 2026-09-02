import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { PnlClient } from "./PnlClient";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

async function getPnlData(teamId: string, from: Date, to: Date) {
  await connectDB();
  const teamOid = mongoose.Types.ObjectId.createFromHexString(teamId);

  const [orders, adSpend] = await Promise.all([
    OrderModel.find({
      teamId: teamOid,
      orderDate: { $gte: from, $lte: to },
      status: { $ne: "cancelled" },
    }).lean(),
    AdSpendDailyModel.aggregate([
      { $match: { teamId: teamOid, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$platform", spend: { $sum: "$spend" } } },
    ]),
  ]);

  // ── Income Statement ──────────────────────────────────────────────────────
  const grossRevenue    = orders.reduce((s, o) => s + o.grossRevenue, 0);
  const discounts       = orders.reduce((s, o) => s + o.discounts, 0);
  const refunds         = orders.reduce((s, o) => s + o.refundAmount, 0);
  const chargebacks     = orders.reduce((s, o) => s + o.chargebackAmount, 0);
  const netRevenue      = grossRevenue - discounts - refunds - chargebacks;
  const shippingRevenue = orders.reduce((s, o) => s + o.shippingRevenue, 0);
  const totalRevenue    = netRevenue + shippingRevenue;

  const cogs            = orders.reduce((s, o) => s + o.totalCogs, 0);
  const grossProfit     = totalRevenue - cogs;
  const grossMargin     = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const transactionFees = orders.reduce((s, o) => s + o.transactionFees, 0);
  const shippingCosts   = orders.reduce((s, o) => s + o.shippingCost, 0);
  const totalAdSpend    = adSpend.reduce((s: number, a: { spend: number }) => s + a.spend, 0);
  const adSpendByPlatform = adSpend as { _id: string; spend: number }[];

  const operatingExpenses = transactionFees + shippingCosts + totalAdSpend;
  const operatingProfit   = grossProfit - operatingExpenses;
  const operatingMargin   = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;

  const taxes             = orders.reduce((s, o) => s + o.taxes, 0);
  const netProfit         = operatingProfit - taxes;
  const netMargin         = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Monthly breakdown for chart
  const monthlyMap = new Map<string, { revenue: number; cogs: number; opex: number; netProfit: number }>();
  for (const o of orders) {
    const key = o.orderDate.toISOString().slice(0, 7);
    const cur = monthlyMap.get(key) ?? { revenue: 0, cogs: 0, opex: 0, netProfit: 0 };
    const rev = o.grossRevenue - o.discounts - o.refundAmount - o.chargebackAmount + o.shippingRevenue;
    cur.revenue  += rev;
    cur.cogs     += o.totalCogs;
    cur.opex     += o.transactionFees + o.shippingCost + o.adSpendAllocated;
    cur.netProfit += o.netProfit;
    monthlyMap.set(key, cur);
  }
  const monthlyChart = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  return {
    summary: {
      grossRevenue, discounts, refunds, chargebacks, shippingRevenue,
      netRevenue, totalRevenue, cogs, grossProfit, grossMargin,
      transactionFees, shippingCosts, totalAdSpend, operatingExpenses,
      operatingProfit, operatingMargin, taxes, netProfit, netMargin,
      orderCount: orders.length,
    },
    adSpendByPlatform,
    monthlyChart,
  };
}

interface Props { searchParams: Promise<{ from?: string; to?: string }> }

export default async function PnlPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const user = session.user as { teamId?: string };
  if (!user.teamId) redirect("/onboarding");

  const params = await searchParams;
  const now = new Date();
  const from = new Date(params.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const to   = new Date(params.to ?? now.toISOString().slice(0, 10));
  to.setHours(23, 59, 59, 999);

  const data = await getPnlData(user.teamId, from, to);

  return (
    <PnlClient
      data={data}
      defaultFrom={from.toISOString().slice(0, 10)}
      defaultTo={to.toISOString().slice(0, 10)}
    />
  );
}
