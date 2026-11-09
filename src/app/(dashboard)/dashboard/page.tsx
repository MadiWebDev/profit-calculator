import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import ProfitGoalModel from "@/models/ProfitGoal";
import ProductModel from "@/models/Product";
import AdAccountModel from "@/models/AdAccount";
import CourierModel from "@/models/Courier";
import { calcPeriodSummary } from "@/lib/profit-engine";
import { getFxRates } from "@/lib/fx";
import { logger } from "@/lib/logger";
import { convertOrdersToBase, sumCosts } from "@/lib/report-currency";
import { OverviewClient } from "./OverviewClient";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDateParam(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

function isoDate(d?: Date | string | null): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  const parsed = d instanceof Date ? d : new Date(d);
  return isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
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

  // Run all DB queries in parallel
  const [
    currentOrders,
    lastOrders,
    chartOrders,
    recentOrders,
    stores,
    totalOrderCount,
    periodOrderCount,
    priorPeriodOrderCount,
    activeGoal,
    productsWithCogs,
    activeAdAccounts,
    couriersOrShipments,
  ] = await Promise.all([

    // ── Current-period orders (non-cancelled only — for financial metrics) ──
    OrderModel.find({
      teamId,
      orderDate: { $gte: from, $lte: toEOD },
      status: { $ne: "cancelled" },
    })
      .select(
        "grossRevenue discounts shippingRevenue shippingCost totalCogs " +
        "transactionFees taxes refundAmount chargebackAmount adSpendAllocated " +
        "netRevenue netProfit profitMargin currency"
      )
      .lean(),

    // ── Prior-period orders (non-cancelled only — for financial metrics) ──
    // currency is selected here too: prior-period conversion needs each
    // order's own currency, not an assumed one.
    OrderModel.find({
      teamId,
      orderDate: { $gte: priorFrom, $lte: priorTo },
      status: { $ne: "cancelled" },
    })
      .select(
        "grossRevenue discounts shippingRevenue shippingCost totalCogs " +
        "transactionFees taxes refundAmount chargebackAmount adSpendAllocated " +
        "netRevenue netProfit profitMargin currency"
      )
      .lean(),

    // ── Current-period orders, ALL statuses, for the daily chart + status
    // split. Money fields are converted per order in JS below — a Mongo
    // $sum cannot convert currencies, so these two series can no longer
    // come from $group aggregates (which summed mixed currencies 1:1).
    OrderModel.find({
      teamId,
      orderDate: { $gte: from, $lte: toEOD },
    })
      .select(
        "orderDate status grossRevenue netRevenue netProfit " +
        "adSpendAllocated totalCogs currency"
      )
      .lean(),

    // ── 5 most recent orders ──────────────────────────────────────────────
    OrderModel.find({
      teamId,
      orderDate: { $gte: from, $lte: toEOD },
    })
      .sort({ orderDate: -1 })
      .limit(5)
      .select("orderNumber externalId orderDate grossRevenue netProfit profitMargin status customerEmail currency")
      .lean(),

    // ── Connected stores ──────────────────────────────────────────────────
    StoreModel.find({ teamId, isActive: true })
      .select("name platform syncStatus lastSyncAt ordersCount currency")
      .lean(),

    // ── Total order count (ever, any status) — for hasOrders flag ────────
    OrderModel.countDocuments({ teamId }),

    // ── In-period order count (ALL statuses) — for Orders KPI card ───────
    OrderModel.countDocuments({
      teamId,
      orderDate: { $gte: from, $lte: toEOD },
    }),

    // ── Prior-period order count (ALL statuses) — for Orders % change ────
    OrderModel.countDocuments({
      teamId,
      orderDate: { $gte: priorFrom, $lte: priorTo },
    }),

    // ── Active goal ───────────────────────────────────────────────────────
    ProfitGoalModel.findOne({
      teamId,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    })
      .select("month targetProfit targetRevenue currentProfit currentRevenue progressPercent")
      .lean()
      .catch(() => null),

    // ── Onboarding checklist signals (Phase 7) ──────────────────────────
    ProductModel.countDocuments({ teamId, cogs: { $gt: 0 } }),
    AdAccountModel.countDocuments({ teamId, isActive: true }),
    CourierModel.countDocuments({ teamId }),
  ]);

  // ── Base currency + per-order FX conversion ─────────────────────────────
  // Base = most common store currency. Every money figure below is first
  // converted, order by order, from that order's own Shopify currency into
  // base — never summed 1:1 across currencies. Single-currency teams are
  // exact (same-currency conversion is a no-op). If FX is unavailable,
  // conversion is skipped and the old 1:1 sums are used rather than
  // failing the whole dashboard.
  const baseCurrency = (() => {
    const counts = new Map<string, number>();
    for (const st of stores) {
      const c = ((st as { currency?: string }).currency ?? "USD").toUpperCase();
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best = "USD";
    let bestN = -1;
    for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
    return best;
  })();

  let fxRates: Record<string, number> | null = null;
  try {
    fxRates = (await getFxRates(baseCurrency)).rates;
  } catch (e) {
    logger.warn("dashboard: FX rates unavailable, aggregating unconverted", {
      error: e instanceof Error ? e.message : "unknown",
    });
  }

  const toCosts = (orders: typeof currentOrders) =>
    convertOrdersToBase(
      orders.map((o) => ({
        currency: (o as { currency?: string }).currency ?? baseCurrency,
        grossRevenue: o.grossRevenue,
        discounts: o.discounts,
        shippingRevenue: o.shippingRevenue,
        shippingCost: o.shippingCost,
        totalCogs: o.totalCogs,
        transactionFees: o.transactionFees,
        taxes: o.taxes,
        refundAmount: o.refundAmount,
        chargebackAmount: o.chargebackAmount,
        adSpendAllocated: o.adSpendAllocated,
      })),
      baseCurrency,
      fxRates,
    );

  const currentCosts = toCosts(currentOrders);
  const lastCosts = toCosts(lastOrders);

  // Daily chart + status split from the converted chart orders. Money only
  // from non-cancelled orders (as before); order counts include all statuses.
  // netRevenue/netProfit per order are derived from the converted costs
  // with the same formula as calcPeriodSummary, per order.
  const dailyMap = new Map<string, { revenue: number; profit: number; orders: number; adSpend: number; cogs: number }>();
  const statusAgg = new Map<string, { count: number; revenue: number }>();
  for (const o of chartOrders) {
    const key = isoDate(o.orderDate as Date);
    const entry = dailyMap.get(key) ?? { revenue: 0, profit: 0, orders: 0, adSpend: 0, cogs: 0 };
    entry.orders += 1;
    const st = statusAgg.get(o.status) ?? { count: 0, revenue: 0 };
    st.count += 1;
    const [converted] = convertOrdersToBase(
      [{
        currency: (o as { currency?: string }).currency ?? baseCurrency,
        grossRevenue: o.grossRevenue,
        discounts: 0,
        shippingRevenue: 0,
        shippingCost: 0,
        totalCogs: o.totalCogs,
        transactionFees: 0,
        taxes: 0,
        refundAmount: 0,
        chargebackAmount: 0,
        adSpendAllocated: o.adSpendAllocated,
      }],
      baseCurrency,
      fxRates,
    );
    st.revenue += converted.grossRevenue;
    statusAgg.set(o.status, st);
    if (o.status !== "cancelled") {
      // netRevenue/netProfit are stored in the order's own currency; convert
      // them with the same rate as grossRevenue for this order.
      const rate = (() => {
        const from = ((o as { currency?: string }).currency ?? baseCurrency).toUpperCase();
        if (!fxRates || from === baseCurrency) return 1;
        const fromRate = fxRates[from];
        const toRate = fxRates[baseCurrency];
        return fromRate > 0 && toRate > 0 ? toRate / fromRate : 1;
      })();
      entry.revenue += (o.netRevenue ?? 0) * rate;
      entry.profit += (o.netProfit ?? 0) * rate;
      entry.adSpend += converted.adSpendAllocated;
      entry.cogs += converted.totalCogs;
    }
    dailyMap.set(key, entry);
  }

  // ── Build filled daily chart data ─────────────────────────────────────────
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
      revenue: round2(e?.revenue  ?? 0),
      profit:  round2(e?.profit   ?? 0),
      orders:  e?.orders   ?? 0,
      adSpend: round2(e?.adSpend  ?? 0),
      cogs:    round2(e?.cogs     ?? 0),
    });
  }

  // ── Period summaries (from converted costs) ───────────────────────────────
  const current = calcPeriodSummary(currentCosts);
  const last    = calcPeriodSummary(lastCosts);

  const pct = (curr: number, prev: number) =>
    prev !== 0 ? round2(((curr - prev) / Math.abs(prev)) * 100) : 0;

  // Orders % change uses the all-status in-period counts, not just non-cancelled
  const ordersChange = pct(periodOrderCount, priorPeriodOrderCount);

  // ── Cost breakdown from converted current-period costs ────────────────────
  // Money contract (see profit-engine.ts): order grossRevenue is tax-exclusive
  // and already net of discounts, with shipping included — so net revenue is
  // gross minus refunds/chargebacks only. discounts/shippingRevenue are memos.
  const cbSums = sumCosts(currentCosts);
  const grossRev   = cbSums.grossRevenue;
  const totalCosts = cbSums.totalCogs + cbSums.shippingCost + cbSums.transactionFees + cbSums.adSpendAllocated;
  const netRev     = grossRev - cbSums.refundAmount - cbSums.chargebackAmount;

  // ROAS: net revenue generated per $ of ad spend
  const roas = cbSums.adSpendAllocated > 0 ? round2(netRev / (cbSums.adSpendAllocated || 1)) : 0;

  // Gross revenue already includes shipping charged to the customer
  const totalGrossRevenue = grossRev;

  // ── Status map (from converted chart orders above) ────────────────────────
  const statusMap: Record<string, { count: number; revenue: number }> = {};
  for (const [status, agg] of statusAgg) {
    statusMap[status] = { count: agg.count, revenue: round2(agg.revenue) };
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
      orders:   ordersChange,
      adSpend:  pct(current.totalAdSpend, last.totalAdSpend),
      cogs:     pct(current.totalCogs,    last.totalCogs),
      refunds:  pct(current.totalRefunds, last.totalRefunds),
      aov:      pct(current.avgOrderValue, last.avgOrderValue),
    },
    totalOrdersInPeriod: periodOrderCount,
    chartData,
    costBreakdown: {
      grossRevenue:     round2(grossRev),
      totalGrossRevenue: round2(totalGrossRevenue),
      discounts:        round2(cbSums.discounts),
      refunds:          round2(cbSums.refundAmount),
      chargebacks:      round2(cbSums.chargebackAmount),
      cogs:             round2(cbSums.totalCogs),
      shippingCost:     round2(cbSums.shippingCost),
      shippingRevenue:  round2(cbSums.shippingRevenue),
      transactionFees:  round2(cbSums.transactionFees),
      adSpend:          round2(cbSums.adSpendAllocated),
      taxes:            round2(cbSums.taxes),
      netProfit:        round2(current.netProfit),
      totalCosts:       round2(totalCosts),
      roas,
      netRevenue:       round2(netRev),
    },
    statusMap,
    recentOrders: recentOrders.map((o) => ({
      id:           o._id.toString(),
      orderNumber:  o.orderNumber ?? o.externalId,
      currency:     (o as { currency?: string }).currency ?? "USD",
      orderDate:    o.orderDate ? (o.orderDate instanceof Date ? o.orderDate.toISOString() : new Date(o.orderDate).toISOString()) : new Date().toISOString(),
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
      currency:    (s as { currency?: string }).currency ?? "USD",
    })),
    // Base currency for FX display conversion = most common store currency.
    // Every aggregate above was converted order-by-order into this currency
    // before summing, so the totals are in baseCurrency even for
    // mixed-currency teams (single-currency teams are exact).
    baseCurrency,
    goalProgress,
    hasOrders: totalOrderCount > 0,
    hasCogs: productsWithCogs > 0,
    hasAds: activeAdAccounts > 0,
    hasCouriers: couriersOrShipments > 0,
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
  if (data.totalOrdersInPeriod === 0 && data.hasOrders) {
    const allTimeFrom = new Date(2000, 0, 1);
    data = await getOverviewData(user.teamId, allTimeFrom, now, "All Time");
  }

  return <OverviewClient data={data} />;
}
