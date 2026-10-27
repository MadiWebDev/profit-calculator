/**
 * Parity report engine — the single aggregation used by every new
 * parity page (Revenue By Date, Country Analysis, Conversion,
 * Mission Control, Leak Detector, Ad Health, Copilot).
 *
 * Reconciliation guarantee: every row is produced by the SAME
 * per-order breakdown (calcTrueNetProfit, the unchanged core profit
 * formula in profit-engine.ts + profit-extended.ts), and every page
 * total is the sum of its rows. A page total therefore agrees with
 * every other parity page for the same period, store and currency
 * filter, to the cent (rounding is applied once, per order, before
 * summing — the same rule calcPeriodSummary uses).
 *
 * Cancelled orders are excluded everywhere, exactly as the existing
 * profit API does. Taxes are pass-through memos, never profit.
 * Discounts and shipping revenue are memos already inside
 * grossRevenue — never subtracted or added again.
 */
import { calcTrueNetProfit, type ExtendedOrderInput } from "@/lib/profit-extended";
import { round, toMoney } from "@/lib/profit-engine";

export interface ReportOrderInput extends ExtendedOrderInput {
  currency?: string;
  orderDate: Date | string;
  status?: string;
  shippingCountry?: string;
  shippingCity?: string;
  source?: string;
  utmCampaign?: string;
  paymentMethod?: string;
  riskBand?: string;
  fulfillmentStatus?: string;
  lineItems?: { productId?: string; name?: string; price?: number; cogs?: number; quantity?: number }[];
}

export interface ReportTotals {
  revenue: number;
  refunds: number;
  cogs: number;
  shippingCost: number;
  transactionFees: number;
  adSpend: number;
  otherCosts: number;
  netProfit: number;
  netMargin: number;
  orderCount: number;
  aov: number;
  refundRate: number;
  rtoRate: number;
}

export const EMPTY_TOTALS: ReportTotals = {
  revenue: 0, refunds: 0, cogs: 0, shippingCost: 0, transactionFees: 0,
  adSpend: 0, otherCosts: 0, netProfit: 0, netMargin: 0, orderCount: 0,
  aov: 0, refundRate: 0, rtoRate: 0,
};

export function isIncludedOrder(o: ReportOrderInput): boolean {
  return (o.status ?? "fulfilled") !== "cancelled";
}

/** Per-order breakdown in the exact shape every parity row uses. */
export function breakdown(o: ReportOrderInput) {
  const b = calcTrueNetProfit(o);
  return {
    revenue: b.netRevenue,
    refunds: b.refunds,
    cogs: b.cogs,
    shippingCost: b.shippingCost,
    transactionFees: b.transactionFees,
    adSpend: b.adSpend,
    otherCosts: round(
      b.codFee + b.subscriptionShare + b.packagingCost + b.rtoLoss +
      b.expenseAllocation + b.otherCosts,
    ),
    netProfit: b.netProfit,
  };
}

export function summarizeOrders(orders: ReportOrderInput[]): ReportTotals {
  const included = orders.filter(isIncludedOrder);
  const t = { ...EMPTY_TOTALS };
  let refunded = 0;
  let rto = 0;
  for (const o of included) {
    const b = breakdown(o);
    t.revenue += b.revenue;
    t.refunds += b.refunds;
    t.cogs += b.cogs;
    t.shippingCost += b.shippingCost;
    t.transactionFees += b.transactionFees;
    t.adSpend += b.adSpend;
    t.otherCosts += b.otherCosts;
    t.netProfit += b.netProfit;
    if (toMoney(o.refundAmount) > 0) refunded += 1;
    if (toMoney(o.rtoLoss) > 0) rto += 1;
  }
  t.revenue = round(t.revenue);
  t.refunds = round(t.refunds);
  t.cogs = round(t.cogs);
  t.shippingCost = round(t.shippingCost);
  t.transactionFees = round(t.transactionFees);
  t.adSpend = round(t.adSpend);
  t.otherCosts = round(t.otherCosts);
  t.netProfit = round(t.netProfit);
  t.orderCount = included.length;
  t.aov = t.orderCount > 0 ? round(t.revenue / t.orderCount) : 0;
  t.netMargin = t.revenue > 0 ? round((t.netProfit / t.revenue) * 100) : 0;
  t.refundRate = t.orderCount > 0 ? round((refunded / t.orderCount) * 100) : 0;
  t.rtoRate = t.orderCount > 0 ? round((rto / t.orderCount) * 100) : 0;
  return t;
}

/** Group orders by a key; each row carries the same totals shape, so
 *  sum(rows) === totals for every money column. */
export function groupOrders<T extends string>(
  orders: ReportOrderInput[],
  keyFn: (o: ReportOrderInput) => T,
): Array<ReportTotals & { key: T }> {
  const map = new Map<T, ReportOrderInput[]>();
  for (const o of orders.filter(isIncludedOrder)) {
    const k = keyFn(o);
    const list = map.get(k) ?? [];
    list.push(o);
    map.set(k, list);
  }
  return [...map.entries()]
    .map(([key, list]) => ({ key, ...summarizeOrders(list) }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

export type Granularity = "daily" | "weekly" | "monthly";

export function bucketKey(d: Date, g: Granularity): string {
  const iso = d.toISOString().slice(0, 10);
  if (g === "daily") return iso;
  if (g === "monthly") return iso.slice(0, 7);
  // Weekly: Monday of the week (UTC), labelled by its Monday date.
  const day = d.getUTCDay(); // 0 = Sunday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

export function bucketOrders(
  orders: ReportOrderInput[],
  g: Granularity,
): Array<ReportTotals & { key: string }> {
  const rows = groupOrders(orders, (o) => bucketKey(new Date(o.orderDate), g));
  return rows.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Day-of-week (0=Sunday..6=Saturday, UTC) and hour-of-day (UTC) patterns.
 *  Money columns sum exactly like every other grouping; aov, margin and
 *  rates are recomputed from the summed columns, never summed themselves. */
export function timePatterns(orders: ReportOrderInput[]) {
  const moneyKeys = [
    "revenue", "refunds", "cogs", "shippingCost", "transactionFees",
    "adSpend", "otherCosts", "netProfit",
  ] as const;
  const make = () => ({
    rows: [] as ReportTotals[],
    refunded: [] as number[],
    rto: [] as number[],
  });
  const dow = make();
  const hour = make();
  for (let i = 0; i < 7; i++) { dow.rows.push({ ...EMPTY_TOTALS }); dow.refunded.push(0); dow.rto.push(0); }
  for (let i = 0; i < 24; i++) { hour.rows.push({ ...EMPTY_TOTALS }); hour.refunded.push(0); hour.rto.push(0); }
  const add = (acc: ReturnType<typeof make>, idx: number, o: ReportOrderInput) => {
    const b = breakdown(o);
    const r = acc.rows[idx];
    for (const k of moneyKeys) r[k] = round(r[k] + b[k]);
    r.orderCount += 1;
    if (toMoney(o.refundAmount) > 0) acc.refunded[idx] += 1;
    if (toMoney(o.rtoLoss) > 0) acc.rto[idx] += 1;
  };
  for (const o of orders.filter(isIncludedOrder)) {
    const d = new Date(o.orderDate);
    add(dow, d.getUTCDay(), o);
    add(hour, d.getUTCHours(), o);
  }
  const fix = (acc: ReturnType<typeof make>) =>
    acc.rows.map((r, i) => ({
      ...r,
      aov: r.orderCount > 0 ? round(r.revenue / r.orderCount) : 0,
      netMargin: r.revenue > 0 ? round((r.netProfit / r.revenue) * 100) : 0,
      refundRate: r.orderCount > 0 ? round((acc.refunded[i] / r.orderCount) * 100) : 0,
      rtoRate: r.orderCount > 0 ? round((acc.rto[i] / r.orderCount) * 100) : 0,
    }));
  return {
    dayOfWeek: fix(dow).map((r, i) => ({ day: i, ...r })),
    hourOfDay: fix(hour).map((r, i) => ({ hour: i, ...r })),
  };
}

export interface MonthlyExpenseInput {
  amount: number;
  currency: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  allocation: "per_day" | "per_order" | "by_revenue";
}

/**
 * Allocate monthly/operating expenses into a reporting period.
 * per_day: overlap days / total expense days × amount. per_order and
 * by_revenue fall back to the same time-proportional share when the
 * period totals are not supplied (callers that have them should use
 * allocateWithTotals instead) — the method is recorded, never hidden.
 */
export function allocateMonthlyExpenses(
  expenses: MonthlyExpenseInput[],
  from: Date,
  to: Date,
): number {
  let total = 0;
  for (const e of expenses) {
    const start = new Date(e.startDate);
    const end = e.endDate ? new Date(e.endDate) : to;
    if (end < start) continue;
    const overlapStart = start > from ? start : from;
    const overlapEnd = end < to ? end : to;
    if (overlapEnd < overlapStart) continue;
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 864e5) + 1);
    const overlapDays = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / 864e5) + 1;
    total += (toMoney(e.amount) * overlapDays) / totalDays;
  }
  return round(total);
}

export interface LeakInput {
  orders: ReportOrderInput[];
  missingCogsProducts: number;
  stuckShipments: number;
  highRiskUnreviewed: number;
}

export interface Leak {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  amount: number;
  actionLabel: string;
  actionHref: string;
}

/** Pure leak detector: every finding names a real amount from the data. */
export function detectLeaks(input: LeakInput): Leak[] {
  const leaks: Leak[] = [];
  const byCampaign = groupOrders(input.orders, (o) => o.utmCampaign ?? "Unattributed");
  for (const c of byCampaign) {
    if (c.adSpend > 0 && c.netProfit < 0) {
      leaks.push({
        id: `campaign-${c.key}`,
        severity: "high",
        title: `Loss-making campaign: ${c.key}`,
        detail: `${c.orderCount} orders, ${c.adSpend.toFixed(2)} ad spend, ${c.netProfit.toFixed(2)} net profit.`,
        amount: Math.abs(c.netProfit),
        actionLabel: "Review campaigns",
        actionHref: "/dashboard/ad-spend",
      });
    }
  }
  const byProduct = new Map<string, { revenue: number; profit: number }>();
  for (const o of input.orders.filter(isIncludedOrder)) {
    for (const li of o.lineItems ?? []) {
      const cur = byProduct.get(li.name ?? "Unknown") ?? { revenue: 0, profit: 0 };
      cur.revenue += toMoney(li.price) * toMoney(li.quantity);
      cur.profit += (toMoney(li.price) - toMoney(li.cogs)) * toMoney(li.quantity);
      byProduct.set(li.name ?? "Unknown", cur);
    }
  }
  for (const [name, p] of byProduct) {
    if (p.revenue > 0 && p.profit < 0) {
      leaks.push({
        id: `product-${name}`,
        severity: "high",
        title: `Negative-margin product: ${name}`,
        detail: `Revenue ${p.revenue.toFixed(2)}, gross profit ${p.profit.toFixed(2)} before allocated costs.`,
        amount: Math.abs(p.profit),
        actionLabel: "Fix COGS / price",
        actionHref: "/dashboard/cogs-hub",
      });
    }
  }
  if (input.missingCogsProducts > 0) {
    leaks.push({
      id: "missing-cogs",
      severity: "medium",
      title: `${input.missingCogsProducts} products missing COGS`,
      detail: "Profit on those products is overstated until COGS is set.",
      amount: 0,
      actionLabel: "Open COGS Hub",
      actionHref: "/dashboard/cogs-hub",
    });
  }
  if (input.stuckShipments > 0) {
    leaks.push({
      id: "stuck-shipments",
      severity: "medium",
      title: `${input.stuckShipments} stuck shipments`,
      detail: "Shipments with no movement for 5+ days risk refunds and RTO.",
      amount: 0,
      actionLabel: "Review couriers",
      actionHref: "/dashboard/couriers",
    });
  }
  if (input.highRiskUnreviewed > 0) {
    leaks.push({
      id: "high-risk",
      severity: "high",
      title: `${input.highRiskUnreviewed} high-risk orders unreviewed`,
      detail: "Review before fulfilment to avoid fake-order losses.",
      amount: 0,
      actionLabel: "Review risk queue",
      actionHref: "/dashboard/risk",
    });
  }
  return leaks.sort((a, b) => b.amount - a.amount);
}
