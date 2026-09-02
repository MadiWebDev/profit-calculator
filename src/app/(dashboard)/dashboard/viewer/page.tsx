import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import ProductModel from "@/models/Product";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { calcPeriodSummary } from "@/lib/profit-engine";
import { ViewerDashboardClient } from "./ViewerDashboardClient";
import mongoose from "mongoose";
import type { UserRole } from "@/components/dashboard/RoleContext";

async function getViewerData(teamId: string) {
  await connectDB();

  const now              = new Date();
  const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const start30          = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const teamOid          = new mongoose.Types.ObjectId(teamId);

  const [
    currentOrders,
    lastOrders,
    dailyRaw,
    topProducts,
    recentOrders,
    adSpend30,
  ] = await Promise.all([
    OrderModel.find({ teamId, orderDate: { $gte: startOfMonth }, status: { $ne: "cancelled" } }).lean(),
    OrderModel.find({ teamId, orderDate: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: { $ne: "cancelled" } }).lean(),

    // 30-day daily chart
    OrderModel.aggregate([
      { $match: { teamId: teamOid, orderDate: { $gte: start30 }, status: { $ne: "cancelled" } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } }, revenue: { $sum: "$netRevenue" }, profit: { $sum: "$netProfit" }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),

    // Top 8 products by profit
    ProductModel.find({ teamId, isActive: true })
      .sort({ totalProfit: -1 })
      .limit(8)
      .select("name sku totalRevenue totalProfit totalOrders avgProfitMargin defaultCogs imageUrl")
      .lean(),

    // Last 10 orders
    OrderModel.find({ teamId, status: { $ne: "cancelled" } })
      .sort({ orderDate: -1 })
      .limit(10)
      .select("orderNumber externalId orderDate status grossRevenue netProfit profitMargin customerEmail")
      .lean(),

    // Ad spend last 30 days grouped by platform
    AdSpendDailyModel.aggregate([
      { $match: { teamId: teamOid, date: { $gte: start30 } } },
      { $group: { _id: "$platform", spend: { $sum: "$spend" }, revenue: { $sum: "$revenueAttributed" }, conversions: { $sum: "$conversions" } } },
      { $sort: { spend: -1 } },
    ]),
  ]);

  // Build chart data with filled gaps
  const dailyMap = new Map(dailyRaw.map((d) => [d._id, d]));
  const chartData: { date: string; revenue: number; profit: number; orders: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const e   = dailyMap.get(key);
    chartData.push({ date: key, revenue: e?.revenue ?? 0, profit: e?.profit ?? 0, orders: e?.orders ?? 0 });
  }

  const toCosts = (orders: typeof currentOrders) =>
    orders.map((o) => ({
      grossRevenue:     o.grossRevenue,
      discounts:        o.discounts,
      shippingRevenue:  o.shippingRevenue,
      shippingCost:     o.shippingCost,
      totalCogs:        o.totalCogs,
      transactionFees:  o.transactionFees,
      taxes:            o.taxes,
      refundAmount:     o.refundAmount,
      chargebackAmount: o.chargebackAmount,
      adSpendAllocated: o.adSpendAllocated,
    }));

  const current = calcPeriodSummary(toCosts(currentOrders));
  const last    = calcPeriodSummary(toCosts(lastOrders));

  const pctChange = (curr: number, prev: number) =>
    prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

  return {
    current,
    changes: {
      revenue: pctChange(current.totalRevenue, last.totalRevenue),
      profit:  pctChange(current.netProfit,    last.netProfit),
      margin:  current.netMargin - last.netMargin,
      orders:  pctChange(current.orderCount,   last.orderCount),
    },
    chartData,
    topProducts: topProducts.map((p) => ({
      id:             p._id.toString(),
      name:           p.name,
      sku:            p.sku,
      totalRevenue:   p.totalRevenue,
      totalProfit:    p.totalProfit,
      totalOrders:    p.totalOrders,
      avgProfitMargin:p.avgProfitMargin,
      imageUrl:       p.imageUrl,
    })),
    recentOrders: recentOrders.map((o) => ({
      id:            o._id.toString(),
      orderNumber:   o.orderNumber ?? o.externalId,
      orderDate:     o.orderDate.toISOString(),
      status:        o.status,
      grossRevenue:  o.grossRevenue,
      netProfit:     o.netProfit,
      profitMargin:  o.profitMargin,
      customerEmail: o.customerEmail,
    })),
    adSpendByPlatform: adSpend30.map((a) => ({
      platform:    a._id as string,
      spend:       a.spend as number,
      revenue:     a.revenue as number,
      conversions: a.conversions as number,
      roas:        a.spend > 0 ? (a.revenue as number) / (a.spend as number) : 0,
    })),
  };
}

export default async function ViewerDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as { teamId?: string; role?: UserRole; name?: string | null };

  if (!user.teamId) redirect("/onboarding");

  // Non-viewers get the regular overview
  if (user.role && user.role !== "viewer") redirect("/dashboard");

  const data = await getViewerData(user.teamId);
  return <ViewerDashboardClient data={data} userName={user.name ?? "there"} />;
}
