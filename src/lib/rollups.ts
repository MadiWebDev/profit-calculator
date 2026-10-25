/**
 * Daily profit rollups — Phase 8 (pure aggregation).
 *
 * The profit dashboard aggregates orders on the fly, which is fine at
 * small scale but gets slower as order history grows. A rollup is one
 * pre-computed row per team per UTC day, built from the same money
 * contract as the dashboard (see profit-engine.ts): grossRevenue is
 * tax-exclusive and net of discounts; cancelled orders are counted
 * separately and excluded from revenue/profit. The rollup job
 * (jobs.ts jobRollupDaily) recomputes the last 7 days on every run,
 * so late refunds/cancellations correct history instead of freezing
 * a stale number.
 *
 * Rollups are an optimisation, not a second source of truth: the
 * dashboard still aggregates live orders, and a rollup row is only
 * ever read as a cache. Any mismatch resolves in favour of live data.
 */

export interface RollupOrderInput {
  grossRevenue: number;
  netProfit: number;
  refundAmount: number;
  totalCogs: number;
  shippingCost: number;
  transactionFees: number;
  status?: string;
}

export interface DailyRollupInput {
  grossRevenue: number;
  netProfit: number;
  refunds: number;
  totalCogs: number;
  shippingCost: number;
  transactionFees: number;
  orderCount: number;
  cancelledOrderCount: number;
}

function num(n: number | undefined | null): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Aggregate one day's orders into a rollup row. Empty input → zeros. */
export function aggregateDayOrders(orders: RollupOrderInput[]): DailyRollupInput {
  let grossRevenue = 0;
  let netProfit = 0;
  let refunds = 0;
  let totalCogs = 0;
  let shippingCost = 0;
  let transactionFees = 0;
  let orderCount = 0;
  let cancelledOrderCount = 0;
  for (const o of orders) {
    if (o.status === "cancelled") {
      cancelledOrderCount++;
      continue;
    }
    orderCount++;
    grossRevenue += num(o.grossRevenue);
    netProfit += num(o.netProfit);
    refunds += num(o.refundAmount);
    totalCogs += num(o.totalCogs);
    shippingCost += num(o.shippingCost);
    transactionFees += num(o.transactionFees);
  }
  return {
    grossRevenue: round2(grossRevenue),
    netProfit: round2(netProfit),
    refunds: round2(refunds),
    totalCogs: round2(totalCogs),
    shippingCost: round2(shippingCost),
    transactionFees: round2(transactionFees),
    orderCount,
    cancelledOrderCount,
  };
}

/** UTC day key (YYYY-MM-DD) for an order date. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
