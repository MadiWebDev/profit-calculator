import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import ProfitGoalModel from "@/models/ProfitGoal";
import { calcPeriodSummary } from "@/lib/profit-engine";
import { OverviewClient } from "./OverviewClient";
import mongoose from "mongoose";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDateParam(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function getOverviewData(
  teamId: string,
  from: Date,
  to: Date,
  dateLabel: string
) {
  await connectDB();

  const now    = new Date();
  const toEOD  = new Date(to);
  toEOD.setHours(23, 59, 59, 999);

  const periodMs  = toEOD.getTime() - from.getTime();
  const priorTo   = new Date(from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - periodMs);

  const teamOid = new mongoose.Types.ObjectId(teamId);

  // Run all DB queries in parallel
  const [
    currentOrders,
    lastOrders,
    dailyRaw,
    statusSplit,
    costBreakdown,
    recentOrders,
    stores,
    totalOrderCount,
    activeGoal,
  ] = await Promise.all([

    // ── Current-period orders (all non-cancelled) ──────────────────────────
    OrderModel.find({
      teamId,
      orderDate: { $gte: from, $lte: toEOD },
      status: { $ne: "cancelled" },
    })
      .select(
        "grossRevenue discounts shippingRevenue shippingCost totalCogs " +
        "transactionFees taxes refundAmount chargebackAmount adSpendAllocated " +
        "netRevenue netProfit profitMargin"
      )
      .lean(),

    // ── Prior-period orders (same length) ──────────────────────────────────
    OrderModel.find({
      teamId,
      orderDate: { $gte: priorFrom, $lte: priorTo },
      status: { $ne: "cancelled" },
    })
      .select(
        "grossRevenue discounts shippingRevenue shippingCost totalCogs " +
        "transactionFees taxes refundAmount chargebackAmount adSpendAllocated " +
        "netRevenue netProfit profitMargin"
      )
      .lean(),

    // ── Daily time-series ─────────────────────────────────────────────────
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
          revenue:  { $sum: "$netRevenue" },
          profit:   { $sum: "$netProfit" },
          orders:   { $sum: 1 },
          adSpend:  { $sum: "$adSpendAllocated" },
          cogs:     { $sum: "$totalCogs" },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // ── Status split (ALL statuses, no filter) ───────────────────────────
    OrderModel.aggregate([
      {
        $match: {
          teamId: teamOid,
          orderDate: { $gte: from, $lte: toEOD },
        },
      },
      {
        $group: {
          _id: "$status",
          count:   { $sum: 1 },
          revenue: { $sum: "$grossRevenue" },
        },
      },
    ]),

    // ── Cost breakdown (single $group over current period) ────────────────
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
          _id: null,
          grossRevenue:     { $sum: "$grossRevenue" },
          discounts:        { $sum: "$discounts" },
          refunds:          { $sum: "$refundAmount" },
          chargebacks:      { $sum: "$chargebackAmount" },
          cogs:             { $sum: "$totalCogs" },
          shippingCost:     { $sum: "$shippingCost" },
          shippingRevenue:  { $sum: "$shippingRevenue" },
          transactionFees:  { $sum: "$transactionFees" },
          adSpend:          { $sum: "$adSpendAllocated" },
          taxes:            { $sum: "$taxes" },
          netProfit:        { $sum: "$netProfit" },
          orderCount:       { $sum: 1 },
        },
      },
    ]),

    // ── 5 most recent orders ──────────────────────────────────────────────
    OrderModel.find({
      teamId,
      orderDate: { $gte: from, $lte: toEOD },
    })
      .sort({ orderDate: -1 })
      .limit(5)
      .select("orderNumber externalId orderDate grossRevenue netProfit profitMargin status customerEmail")
      .lean(),

    // ── Connected stores ──────────────────────────────────────────────────
    StoreModel.find({ teamId, isActive: true })
      .select("name platform syncStatus lastSyncAt ordersCount")
      .lean(),

    // ── Total order count (ever) ──────────────────────────────────────────
    OrderModel.countDocuments({ teamId }),

    // ── Active goal ───────────────────────────────────────────────────────
    ProfitGoalModel.findOne({
      teamId,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    })
      .select("month targetProfit targetRevenue currentProfit currentRevenue progressPercent")
      .lean()
      .catch(() => null),
  ]);

  // ── Build filled daily chart data ─────────────────────────────────────────
  const dailyMap = new Map(dailyRaw.map((d) => [d._id as string, d]));
  const chartData: {
    date: string;
    revenue: number;
    profit: number;
    orders: number;
    adSpend: number;
    cogs: number;
  }[] = [];
  const dayCount = Math.round((toEOD.getTime() - from.getTime()) / 86_400_000) + 1;
  const step = Math.max(1, Math.floor(dayCount / 90));
  for (let i = 0; i < dayCount; i += step) {
    const d   = new Date(from.getTime() + i * 86_400_000);
    const key = isoDate(d);
    const e   = dailyMap.get(key);
    chartData.push({
      date:    key,
      revenue: e?.revenue  ?? 0,
      profit:  e?.profit   ?? 0,
      orders:  e?.orders   ?? 0,
      adSpend: e?.adSpend  ?? 0,
      cogs:    e?.cogs     ?? 0,
    });
  }

  // ── Period summaries ──────────────────────────────────────────────────────
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

  const pct = (curr: number, prev: number) =>
    prev !== 0 ? round2(((curr - prev) / Math.abs(prev)) * 100) : 0;

  // ── Cost breakdown from aggregate ─────────────────────────────────────────
  const cb = costBreakdown[0] ?? {};
  const grossRev   = cb.grossRevenue   ?? 0;
  const totalCosts = (cb.cogs ?? 0) + (cb.shippingCost ?? 0) + (cb.transactionFees ?? 0) + (cb.adSpend ?? 0);
  const netRev     = grossRev - (cb.discounts ?? 0) - (cb.refunds ?? 0) - (cb.chargebacks ?? 0);

  // ROAS: net revenue generated per $ of ad spend
  const roas = (cb.adSpend ?? 0) > 0 ? round2(netRev / (cb.adSpend ?? 1)) : 0;

  // Gross revenue incl. shipping charged to customer
  const totalGrossRevenue = grossRev + (cb.shippingRevenue ?? 0);

  // ── Status map ────────────────────────────────────────────────────────────
  const statusMap: Record<string, { count: number; revenue: number }> = {};
  for (const s of statusSplit) {
    statusMap[s._id as string] = { count: s.count, revenue: round2(s.revenue) };
  }

  // ── Goal progress ─────────────────────────────────────────────────────────
  let goalProgress: {
    label: string;
    target: number;
    current: number;
    pct: number;
    type: string;
  } | null = null;

  if (activeGoal) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = activeGoal as any;
    // Show profit goal if set, fallback to revenue goal
    const hasProfit  = (g.targetProfit  ?? 0) > 0;
    const hasRevenue = (g.targetRevenue ?? 0) > 0;
    const target  = hasProfit  ? (g.targetProfit  as number) : hasRevenue ? (g.targetRevenue as number) : 0;
    const goalCur = hasProfit  ? current.netProfit            : hasRevenue ? current.totalRevenue         : 0;
    const type    = hasProfit  ? "profit"                     : "revenue";
    const label   = hasProfit  ? "Profit Goal"                : "Revenue Goal";

    if (target > 0) {
      goalProgress = {
        label,
        target,
        current: round2(goalCur),
        pct:     Math.min(100, round2((goalCur / target) * 100)),
        type,
      };
    }
  }

  return {
    current,
    last,
    changes: {
      revenue:  pct(current.totalRevenue, last.totalRevenue),
      profit:   pct(current.netProfit,    last.netProfit),
      margin:   round2(current.netMargin  - last.netMargin),
      orders:   pct(current.orderCount,   last.orderCount),
      adSpend:  pct(current.totalAdSpend, last.totalAdSpend),
      cogs:     pct(current.totalCogs,    last.totalCogs),
      refunds:  pct(current.totalRefunds, last.totalRefunds),
      aov:      pct(current.avgOrderValue, last.avgOrderValue),
    },
    chartData,
    costBreakdown: {
      grossRevenue:     round2(grossRev),
      totalGrossRevenue: round2(totalGrossRevenue),
      discounts:        round2(cb.discounts       ?? 0),
      refunds:          round2(cb.refunds         ?? 0),
      chargebacks:      round2(cb.chargebacks     ?? 0),
      cogs:             round2(cb.cogs            ?? 0),
      shippingCost:     round2(cb.shippingCost    ?? 0),
      shippingRevenue:  round2(cb.shippingRevenue ?? 0),
      transactionFees:  round2(cb.transactionFees ?? 0),
      adSpend:          round2(cb.adSpend         ?? 0),
      taxes:            round2(cb.taxes           ?? 0),
      netProfit:        round2(cb.netProfit       ?? 0),
      totalCosts:       round2(totalCosts),
      roas,
      netRevenue:       round2(netRev),
    },
    statusMap,
    recentOrders: recentOrders.map((o) => ({
      id:           o._id.toString(),
      orderNumber:  o.orderNumber ?? o.externalId,
      orderDate:    (o.orderDate as Date).toISOString(),
      grossRevenue: o.grossRevenue,
      netProfit:    o.netProfit,
      profitMargin: o.profitMargin,
      status:       o.status,
      customerEmail: o.customerEmail ?? null,
    })),
    stores: stores.map((s) => ({
      id:          s._id.toString(),
      name:        s.name,
      platform:    s.platform,
      syncStatus:  s.syncStatus,
      lastSyncAt:  s.lastSyncAt ? (s.lastSyncAt as Date).toISOString() : undefined,
      ordersCount: s.ordersCount ?? 0,
    })),
    goalProgress,
    hasOrders: totalOrderCount > 0,
    dateRange: { from: isoDate(from), to: isoDate(to), label: dateLabel },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string; label?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as { teamId?: string; role?: string };
  if (!user.teamId) redirect("/onboarding");

  const params = (await (searchParams ?? Promise.resolve({}))) as {
    from?: string;
    to?: string;
    label?: string;
  };

  const now         = new Date();
  // Default to Last 30 Days — wide enough to catch any recent CSV import
  const defaultFrom = new Date(now.getTime() - 29 * 86_400_000);
  const defaultTo   = now;

  const from      = parseDateParam(params.from ?? null, defaultFrom);
  const to        = parseDateParam(params.to   ?? null, defaultTo);
  const dateLabel = params.label ?? "Last 30 Days";

  let data = await getOverviewData(user.teamId, from, to, dateLabel);

  // If the selected range has zero orders but orders exist in the DB,
  // automatically fall back to all-time so the user always sees their data.
  if (data.current.orderCount === 0 && data.hasOrders) {
    const allTimeFrom = new Date(2000, 0, 1);
    data = await getOverviewData(user.teamId, allTimeFrom, now, "All Time");
  }

  return <OverviewClient data={data} />;
}
