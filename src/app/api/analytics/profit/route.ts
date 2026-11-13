/**
 * GET /api/analytics/profit — Phase 3 true-profit dashboard API.
 *
 * Query: from, to (ISO dates, default last 30 days), storeId (optional),
 * format=json (default) | csv.
 *
 * Returns, all team-scoped: dashboard metrics (revenue, net profit,
 * margin, AOV, ROAS, MER, break-even ROAS, CAC, LTV, return/RTO rates,
 * COD cash collected vs pending), the previous-period comparison for
 * the same length, a daily series, and a per-product winners/losers
 * table (gross profit = revenue − COGS, before allocated costs).
 * Cancelled orders are excluded from metrics (they are not sales).
 * CSV format exports the daily series.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import OtherFeeRuleModel from "@/models/OtherFeeRule";
import { computeOtherFees } from "@/lib/other-fees";
import {
  calcDashboardMetrics,
  comparePeriods,
  type DashboardMetrics,
  type DashboardOrderInput,
} from "@/lib/profit-extended";
import { getSyncedAdSpend } from "@/lib/ad-spend";
import {
  convertAmount,
  convertOrdersToBase,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";

const QuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    storeId: z.string().optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict();

function toInput(o: Record<string, unknown>): DashboardOrderInput {
  const n = (k: string): number => {
    const v = o[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  return {
    grossRevenue: n("grossRevenue"),
    discounts: n("discounts"),
    shippingRevenue: n("shippingRevenue"),
    shippingCost: n("shippingCost"),
    totalCogs: n("totalCogs"),
    transactionFees: n("transactionFees"),
    taxes: n("taxes"),
    refundAmount: n("refundAmount"),
    chargebackAmount: n("chargebackAmount"),
    adSpendAllocated: n("adSpendAllocated"),
    otherCosts: n("otherCosts"),
    packagingCost: n("packagingCost"),
    codFee: n("codFee"),
    subscriptionShare: n("subscriptionShare"),
    rtoLoss: n("rtoLoss"),
    expenseAllocation: n("expenseAllocation"),
    status: typeof o.status === "string" ? o.status : undefined,
    isRto: n("rtoLoss") > 0,
    isReturn: n("refundAmount") > 0,
    customerKey: (o.customerId as string | undefined) ?? (o.customerEmail as string | undefined),
    isFirstOrder: o.isFirstOrder === true,
    codCollected: n("codCollected"),
    codPending: n("codPending"),
  };
}

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "analytics-profit");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { from, to, storeId, format } = parsed.data;

  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 864e5);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return NextResponse.json({ error: "Invalid date range", code: "BAD_REQUEST" }, { status: 400 });
  }
  const lengthMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - lengthMs);

  await connectDB();
  const baseFilter: Record<string, unknown> = { teamId: toObjectId(session.teamId) };
  if (storeId) {
    if (!/^[a-f0-9]{24}$/i.test(storeId)) {
      return NextResponse.json({ error: "Invalid storeId", code: "BAD_REQUEST" }, { status: 400 });
    }
    baseFilter.storeId = toObjectId(storeId);
  }

  const [orders, prevOrders] = await Promise.all([
    OrderModel.find({ ...baseFilter, orderDate: { $gte: fromDate, $lte: toDate } }).lean(),
    OrderModel.find({ ...baseFilter, orderDate: { $gte: prevFrom, $lte: prevTo } }).lean(),
  ]);

  // Convert each order into the report base currency before any
  // summing (metrics, daily series, per-product table); the previous
  // code summed mixed-currency orders 1:1.
  const base = await getReportBaseCurrency(session.teamId, storeId);
  const rates = await getReportRates(base, session.teamId);
  const convertDocs = (docs: typeof orders) => {
    const core = convertOrdersToBase(
      docs.map((o) => {
        const r = o as unknown as Record<string, unknown>;
        const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
        return {
          currency: typeof r.currency === "string" ? r.currency : undefined,
          grossRevenue: n("grossRevenue"), discounts: n("discounts"), shippingRevenue: n("shippingRevenue"),
          shippingCost: n("shippingCost"), totalCogs: n("totalCogs"), transactionFees: n("transactionFees"),
          taxes: n("taxes"), refundAmount: n("refundAmount"), chargebackAmount: n("chargebackAmount"),
          adSpendAllocated: n("adSpendAllocated"), otherCosts: n("otherCosts"),
        };
      }),
      base,
      rates,
    );
    return docs.map((o, i) => {
      const r = o as unknown as Record<string, unknown>;
      const from = typeof r.currency === "string" ? r.currency : base;
      const conv = (v: unknown) => convertAmount(typeof v === "number" ? v : 0, from, base, rates);
      return {
        ...o,
        ...core[i],
        packagingCost: conv(r.packagingCost),
        codFee: conv(r.codFee),
        subscriptionShare: conv(r.subscriptionShare),
        rtoLoss: conv(r.rtoLoss),
        expenseAllocation: conv(r.expenseAllocation),
        codCollected: conv(r.codCollected),
        codPending: conv(r.codPending),
        lineItems: ((r.lineItems as { price?: number; cogs?: number }[] | undefined) ?? []).map((li) => ({
          ...li,
          price: conv(li.price),
          cogs: conv(li.cogs),
        })),
      };
    });
  };
  const convOrders = convertDocs(orders);
  const convPrevOrders = convertDocs(prevOrders);

  // Other-fee rules: each matching order's fee is added to that
  // order's otherCosts BEFORE metrics are computed, so netProfit,
  // netMargin, totalCosts and LTV all reflect it — for the current
  // and the previous period alike, and the daily series inherits it
  // through the same per-order inputs. Formula per order:
  // percent → grossRevenue × value/100; fixed_per_order → value
  // converted from the rule's currency into the report base.
  const otherFeeRules = await OtherFeeRuleModel.find({ teamId: toObjectId(session.teamId), isActive: true }).lean();
  const otherFeeRuleInputs = otherFeeRules.map((r) => ({
    kind: r.kind, value: r.value, currency: r.currency,
    country: r.country, productTag: r.productTag, paymentMethod: r.paymentMethod,
    effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
  }));
  const applyOtherFees = (docs: typeof convOrders): number => {
    const { total, perOrder } = computeOtherFees(
      otherFeeRuleInputs,
      docs.map((o) => {
        const r = o as unknown as Record<string, unknown>;
        return {
          grossRevenue: typeof r.grossRevenue === "number" ? r.grossRevenue : 0,
          shippingCountry: typeof r.shippingCountry === "string" ? r.shippingCountry : undefined,
          paymentMethod: typeof r.paymentMethod === "string" ? r.paymentMethod : undefined,
          orderDate: r.orderDate as Date,
          status: typeof r.status === "string" ? r.status : undefined,
          lineItems: ((r.lineItems as { tags?: string[] }[] | undefined) ?? []).map((li) => ({ tags: li.tags ?? null })),
        };
      }),
      { baseCurrency: base, rates },
    );
    docs.forEach((d, i) => {
      const rec = d as unknown as Record<string, unknown>;
      rec.otherCosts = (typeof rec.otherCosts === "number" ? rec.otherCosts : 0) + perOrder[i];
    });
    return total;
  };
  const otherFees = applyOtherFees(convOrders);
  const prevOtherFees = applyOtherFees(convPrevOrders);

  let metrics = calcDashboardMetrics(convOrders.map((o) => toInput(o as unknown as Record<string, unknown>)));
  let previous = calcDashboardMetrics(convPrevOrders.map((o) => toInput(o as unknown as Record<string, unknown>)));
  let deltas = comparePeriods(metrics, previous);

  // Daily series
  const byDay = new Map<string, DashboardOrderInput[]>();
  for (const o of convOrders) {
    const d = new Date((o as { orderDate: Date }).orderDate).toISOString().slice(0, 10);
    const list = byDay.get(d) ?? [];
    list.push(toInput(o as unknown as Record<string, unknown>));
    byDay.set(d, list);
  }
  let daily = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => ({ date, ...calcDashboardMetrics(list) }));

  // F5: fold synced ad spend (AdSpendDaily) into the metrics. The
  // per-order calc only sees adSpendAllocated, which Shopify sync
  // always writes as 0, so synced spend never reduced profit here.
  // totalAdSpend = synced + allocated (disjoint sources, no
  // double-counting); net profit drops by the synced amount and
  // ROAS/MER/break-even/CAC are recomputed on the combined spend.
  // The previous period gets its own period's synced spend so deltas
  // compare like with like. FX failure fails open (unconverted),
  // matching this route's existing order-conversion convention.
  // LTV is netProfit / customer count; the count is recovered from
  // the pre-adjustment figures (ltv = netProfit / n) so it stays
  // consistent with the adjusted profit.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const withSyncedSpend = (m: DashboardMetrics, syncedTotal: number): DashboardMetrics => {
    const adSpend = r2(m.adSpend + syncedTotal);
    const netProfit = r2(m.netProfit - syncedTotal);
    const nonAdCosts = m.totalCosts - m.adSpend;
    return {
      ...m,
      adSpend,
      netProfit,
      netMargin: m.revenue > 0 ? r2((netProfit / m.revenue) * 100) : 0,
      roas: adSpend > 0 ? r2(m.revenue / adSpend) : 0,
      mer: adSpend > 0 ? r2(m.revenue / adSpend) : 0,
      breakEvenRoas: adSpend > 0 ? r2((adSpend + nonAdCosts) / adSpend) : 0,
      cac: m.newCustomers > 0 ? r2(adSpend / m.newCustomers) : 0,
      ltv: m.netProfit !== 0 ? r2((netProfit * m.ltv) / m.netProfit) : 0,
      totalCosts: r2(m.revenue - netProfit),
    };
  };
  const syncedSpendOpts = { rates, ...(storeId ? { storeId } : {}) };
  const synced = await getSyncedAdSpend(session.teamId, fromDate, toDate, base, syncedSpendOpts);
  const prevSynced = await getSyncedAdSpend(session.teamId, prevFrom, prevTo, base, syncedSpendOpts);
  metrics = withSyncedSpend(metrics, synced.total);
  previous = withSyncedSpend(previous, prevSynced.total);
  deltas = comparePeriods(metrics, previous);
  // Daily figures get that day's synced spend (days with spend but no
  // orders stay absent from the series — the series is order-driven).
  daily = daily.map((d) => ({ ...d, ...withSyncedSpend(d, synced.byDay[d.date] ?? 0) }));

  // Per-product winners/losers (gross profit before allocated costs)
  const productMap = new Map<string, { productId: string; name: string; revenue: number; cogs: number; units: number; orders: number }>();
  for (const o of convOrders) {
    if ((o as { status?: string }).status === "cancelled") continue;
    for (const li of (o as { lineItems?: { productId?: string; name?: string; price?: number; cogs?: number; quantity?: number }[] }).lineItems ?? []) {
      const key = li.productId ?? li.name ?? "unknown";
      const cur = productMap.get(key) ?? { productId: key, name: li.name ?? key, revenue: 0, cogs: 0, units: 0, orders: 0 };
      cur.revenue += (li.price ?? 0) * (li.quantity ?? 0);
      cur.cogs += (li.cogs ?? 0) * (li.quantity ?? 0);
      cur.units += li.quantity ?? 0;
      cur.orders += 1;
      productMap.set(key, cur);
    }
  }
  const products = [...productMap.values()]
    .map((p) => ({
      ...p,
      revenue: Math.round(p.revenue * 100) / 100,
      grossProfit: Math.round((p.revenue - p.cogs) * 100) / 100,
      margin: p.revenue > 0 ? Math.round(((p.revenue - p.cogs) / p.revenue) * 100 * 100) / 100 : 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);

  if (format === "csv") {
    const header = "date,orders,revenue,netProfit,netMargin,adSpend,roas,rtoRate,returnRate,cashCollected,cashPending";
    const rows = daily.map((d) =>
      [d.date, d.orderCount, d.revenue, d.netProfit, d.netMargin, d.adSpend, d.roas, d.rtoRate, d.returnRate, d.cashCollected, d.cashPending].join(",")
    );
    return new NextResponse([header, ...rows].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="profit-daily-${fromDate.toISOString().slice(0, 10)}-${toDate.toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    metrics,
    previous,
    deltas,
    daily,
    products,
    winners: products.slice(0, 10),
    losers: [...products].reverse().slice(0, 10),
    otherFees,
    previousOtherFees: prevOtherFees,
    generatedAt: new Date().toISOString(),
  });
}
