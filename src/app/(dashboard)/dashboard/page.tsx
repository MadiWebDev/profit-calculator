import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import { calcPeriodSummary } from "@/lib/profit-engine";
import { OverviewClient } from "./OverviewClient";
import mongoose from "mongoose";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDateParam(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function getOverviewData(
  teamId: string,
  from: Date,
  to: Date,
  dateLabel: string
) {
  await connectDB();

  // End of day for `to` so the day is fully included
  const toEOD = new Date(to);
  toEOD.setHours(23, 59, 59, 999);

  // Prior period of the same length for comparison
  const periodMs   = toEOD.getTime() - from.getTime();
  const priorTo    = new Date(from.getTime() - 1);           // one ms before from
  const priorFrom  = new Date(priorTo.getTime() - periodMs);

  const teamOid = new mongoose.Types.ObjectId(teamId);

  const [currentOrders, lastOrders, dailyRaw, stores, totalOrderCount] = await Promise.all([
    OrderModel.find({
      teamId,
      orderDate: { $gte: from, $lte: toEOD },
      status: { $ne: "cancelled" },
    }).lean(),

    OrderModel.find({
      teamId,
      orderDate: { $gte: priorFrom, $lte: priorTo },
      status: { $ne: "cancelled" },
    }).lean(),

    // Daily time-series for the selected range (up to 90 days rendered cleanly)
    OrderModel.aggregate([
      {
        $match: {
          teamId: teamOid,
          orderDate: { $gte: from, $lte: toEOD },
          status: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } },
          revenue: { $sum: "$netRevenue" },
          profit:  { $sum: "$netProfit" },
          orders:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    StoreModel.find({ teamId, isActive: true })
      .select("name platform syncStatus lastSyncAt")
      .lean(),

    OrderModel.countDocuments({ teamId }),
  ]);

  // Fill every day in the range with 0 if no orders
  const dailyMap = new Map(dailyRaw.map((d) => [d._id, d]));
  const chartData: { date: string; revenue: number; profit: number; orders: number }[] = [];
  const dayCount = Math.round((toEOD.getTime() - from.getTime()) / 86_400_000) + 1;
  // Cap chart points at 90 to keep it readable
  const step = Math.max(1, Math.floor(dayCount / 90));
  for (let i = 0; i < dayCount; i += step) {
    const d   = new Date(from.getTime() + i * 86_400_000);
    const key = isoDate(d);
    const e   = dailyMap.get(key);
    chartData.push({
      date:    key,
      revenue: e?.revenue ?? 0,
      profit:  e?.profit  ?? 0,
      orders:  e?.orders  ?? 0,
    });
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
    stores: stores.map((s) => ({
      id:         s._id.toString(),
      name:       s.name,
      platform:   s.platform,
      syncStatus: s.syncStatus,
      lastSyncAt: s.lastSyncAt?.toISOString(),
    })),
    hasOrders: totalOrderCount > 0,
    dateRange: {
      from:  isoDate(from),
      to:    isoDate(to),
      label: dateLabel,
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string; label?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as { teamId?: string; role?: string };
  if (!user.teamId) redirect("/onboarding");

  if (user.role === "viewer") redirect("/dashboard/viewer");

  // Resolve date range from URL params, default to current month
  const params = (await (searchParams ?? Promise.resolve({}))) as { from?: string; to?: string; label?: string };

  const now           = new Date();
  const defaultFrom   = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo     = now;

  const from      = parseDateParam(params.from ?? null, defaultFrom);
  const to        = parseDateParam(params.to   ?? null, defaultTo);
  const dateLabel = params.label ?? "This Month";

  const data = await getOverviewData(user.teamId, from, to, dateLabel);
  return <OverviewClient data={data} />;
}
