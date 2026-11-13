/**
 * Customer-LTV aggregation with per-order currency conversion.
 *
 * The old LTV page summed stored money fields 1:1 in Mongo
 * (`$sum: "$netRevenue"` …) with no conversion, so a multi-currency
 * team got lifetime totals inflated ~37x at runtime (Oct cohort
 * Rs 13,944,244.99 for ~Rs 378k of real revenue). Mongo cannot
 * convert per row, so the aggregation moves here: each order's money
 * is converted into the report base currency with `convertAmount`
 * BEFORE any summing — the same rule P&L / product-intel / RFM
 * follow. Ad spend stays per-order `adSpendAllocated` only:
 * campaign-level synced spend cannot be attributed per customer.
 *
 * This module is pure (no DB, no FX fetch) so the aggregation is
 * unit-testable: callers pass already-fetched orders plus the base
 * currency and rates table.
 */

import { convertAmount } from "@/lib/report-currency";

export interface LtvOrderInput {
  customerEmail: string;
  orderDate: Date | string;
  currency?: string | null;
  netRevenue?: number | null;
  netProfit?: number | null;
  totalCogs?: number | null;
  adSpendAllocated?: number | null;
}

export interface LtvCustomerRow {
  _id: string;
  firstOrderDate: Date;
  lastOrderDate: Date;
  orderCount: number;
  totalRevenue: number;
  totalProfit: number;
  totalCogs: number;
  totalAdSpend: number;
  avgOrderValue: number;
}

export interface LtvMonthRow {
  _id: string;
  totalRevenue: number;
  totalProfit: number;
  activeCustomers: number;
  totalOrders: number;
}

export interface LtvFrequencyBucket {
  _id: number | string;
  customers: number;
}

export interface LtvAggregation {
  customers: LtvCustomerRow[];
  trend: LtvMonthRow[];
  frequency: LtvFrequencyBucket[];
}

const n = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** $bucket boundaries [1, 2, 3, 4, 6, 11] with default "many" (>= 11). */
function frequencyBucket(count: number): number | string {
  if (count < 2) return 1;
  if (count < 3) return 2;
  if (count < 4) return 3;
  if (count < 6) return 4;
  if (count < 11) return 6;
  return "many";
}

/**
 * Aggregate per-customer lifetime stats, the monthly trend (last 12
 * months), and the order-frequency distribution from one list of
 * orders. Every money field is converted per order into
 * `baseCurrency` before summing; orders with no usable email or no
 * parseable orderDate are skipped (the old $match excluded empty
 * emails; an unparseable date would have crashed the old code's
 * `.toISOString()` downstream).
 */
export function aggregateLtvOrders(
  orders: LtvOrderInput[],
  baseCurrency: string,
  rates: Record<string, number> | null,
  now = new Date(),
): LtvAggregation {
  const trendStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  interface Acc {
    email: string;
    firstOrderDate: Date;
    lastOrderDate: Date;
    orderCount: number;
    totalRevenue: number;
    totalProfit: number;
    totalCogs: number;
    totalAdSpend: number;
  }
  const byCustomer = new Map<string, Acc>();
  // month -> { revenue, profit, orders, emails }
  const byMonth = new Map<string, { revenue: number; profit: number; orders: number; emails: Set<string> }>();

  // Input arrives sorted by orderDate ascending (page sorts the query),
  // but track min/max explicitly so the result never depends on order.
  for (const o of orders) {
    const email = typeof o.customerEmail === "string" ? o.customerEmail : "";
    if (!email) continue;
    const date = o.orderDate instanceof Date ? o.orderDate : new Date(o.orderDate);
    if (Number.isNaN(date.getTime())) continue;
    const currency = typeof o.currency === "string" ? o.currency : undefined;
    const revenue = convertAmount(n(o.netRevenue), currency, baseCurrency, rates);
    const profit = convertAmount(n(o.netProfit), currency, baseCurrency, rates);
    const cogs = convertAmount(n(o.totalCogs), currency, baseCurrency, rates);
    const adSpend = convertAmount(n(o.adSpendAllocated), currency, baseCurrency, rates);

    const acc = byCustomer.get(email) ?? {
      email,
      firstOrderDate: date,
      lastOrderDate: date,
      orderCount: 0,
      totalRevenue: 0,
      totalProfit: 0,
      totalCogs: 0,
      totalAdSpend: 0,
    };
    if (date < acc.firstOrderDate) acc.firstOrderDate = date;
    if (date > acc.lastOrderDate) acc.lastOrderDate = date;
    acc.orderCount++;
    acc.totalRevenue += revenue;
    acc.totalProfit += profit;
    acc.totalCogs += cogs;
    acc.totalAdSpend += adSpend;
    byCustomer.set(email, acc);

    if (date >= trendStart) {
      const month = date.toISOString().slice(0, 7);
      const m = byMonth.get(month) ?? { revenue: 0, profit: 0, orders: 0, emails: new Set<string>() };
      m.revenue += revenue;
      m.profit += profit;
      m.orders++;
      m.emails.add(email);
      byMonth.set(month, m);
    }
  }

  const customers: LtvCustomerRow[] = [...byCustomer.values()]
    .sort((a, b) => a.firstOrderDate.getTime() - b.firstOrderDate.getTime())
    .map((c) => ({
      _id: c.email,
      firstOrderDate: c.firstOrderDate,
      lastOrderDate: c.lastOrderDate,
      orderCount: c.orderCount,
      totalRevenue: c.totalRevenue,
      totalProfit: c.totalProfit,
      totalCogs: c.totalCogs,
      totalAdSpend: c.totalAdSpend,
      avgOrderValue: c.orderCount > 0 ? c.totalRevenue / c.orderCount : 0,
    }));

  const trend: LtvMonthRow[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      _id: month,
      totalRevenue: m.revenue,
      totalProfit: m.profit,
      activeCustomers: m.emails.size,
      totalOrders: m.orders,
    }));

  const bucketCounts = new Map<number | string, number>();
  for (const c of byCustomer.values()) {
    const b = frequencyBucket(c.orderCount);
    bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
  }
  const frequency: LtvFrequencyBucket[] = [...bucketCounts.entries()]
    .map(([bucket, count]) => ({ _id: bucket, customers: count }));

  return { customers, trend, frequency };
}
