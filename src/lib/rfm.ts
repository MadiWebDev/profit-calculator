/**
 * RFM customer segmentation — pure module (no DB, no network).
 *
 * Groups orders by customer and scores each customer on Recency,
 * Frequency and Monetary value, then assigns one marketing segment.
 *
 * Scoring is RELATIVE to the store's own customers, not absolute
 * benchmarks: R, F and M are each 1-5 by rank percentile (quintiles)
 * within the dataset passed in. A score of 5 means "top fifth of
 * this store's customers on that dimension", not "objectively great".
 * Scores therefore shift as the customer base changes; they are a
 * comparison tool, not a grade against an external standard.
 *
 * Ranking method: values are sorted ascending and each customer gets
 * the AVERAGE rank of its tied group (ties share one rank, so tied
 * customers always receive the same score). Percentile p =
 * (averageRank - 1) / (n - 1); score = 1 + floor(p * 5), clamped to
 * 1-5, with the direction flipped for Recency (fewer days since the
 * last order is better). With a single customer there is no
 * percentile spread to rank on, so all three scores are 3.
 *
 * Segment precedence (first match wins):
 *   champions > loyal > new > at-risk > lost > regular
 * So a customer qualifying for both loyal and at-risk is "loyal",
 * and a customer qualifying for both at-risk and lost is "at-risk"
 * (the "lost" rule additionally requires not-at-risk, which the
 * precedence makes redundant but keeps explicit).
 *
 * Money is rounded to 2dp via `round`/`toMoney` from profit-engine;
 * non-finite money inputs coerce to 0. Dates: an order with an
 * unparseable orderDate is skipped (it cannot contribute a recency).
 * Cancelled orders are excluded; refunded orders are included as
 * recorded (their netRevenue/netProfit already reflect the refund).
 */

import { round, toMoney } from "@/lib/profit-engine";

export type RfmOrderStatus =
  | "pending"
  | "fulfilled"
  | "refunded"
  | "cancelled";

export interface RfmOrderInput {
  customerEmail?: string | null;
  orderDate: Date | string;
  netRevenue: number;
  netProfit: number;
  status: RfmOrderStatus;
  isFirstOrder?: boolean;
}

export type RfmSegment =
  | "champions"
  | "loyal"
  | "new"
  | "at-risk"
  | "lost"
  | "regular";

export interface RfmCustomer {
  email: string;
  orders: number;
  totalRevenue: number;
  totalProfit: number;
  firstOrderDate: Date;
  lastOrderDate: Date;
  recencyDays: number;
  avgOrderValue: number;
  scoreR: number;
  scoreF: number;
  scoreM: number;
  segment: RfmSegment;
}

export interface RfmSegmentSummary {
  count: number;
  totalRevenue: number;
  totalProfit: number;
  avgRecencyDays: number;
}

export type RfmSegments = Record<RfmSegment, RfmSegmentSummary>;

export interface RfmResult {
  customers: RfmCustomer[];
  segments: RfmSegments;
}

export const RFM_SEGMENTS: readonly RfmSegment[] = [
  "champions",
  "loyal",
  "new",
  "at-risk",
  "lost",
  "regular",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function emptySegments(): RfmSegments {
  const out = {} as RfmSegments;
  for (const segment of RFM_SEGMENTS) {
    out[segment] = {
      count: 0,
      totalRevenue: 0,
      totalProfit: 0,
      avgRecencyDays: 0,
    };
  }
  return out;
}

/**
 * Quintile score (1-5) for one metric across the whole dataset.
 * `values` are the raw metric values, one per customer, in the same
 * order as the customers array. `higherIsBetter` flips the direction
 * (true for frequency/monetary, false for recency days).
 * Tied values share their group's average rank, hence the same score.
 */
function quintileScores(values: number[], higherIsBetter: boolean): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [3];
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const scores = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1].value === order[i].value) j++;
    // Average 1-based rank of the tied group [i..j].
    const avgRank = (i + 1 + (j + 1)) / 2;
    const percentile = (avgRank - 1) / (n - 1);
    const raw = higherIsBetter
      ? 1 + Math.floor(percentile * 5)
      : 5 - Math.floor(percentile * 5);
    const score = Math.min(5, Math.max(1, raw));
    for (let k = i; k <= j; k++) scores[order[k].index] = score;
    i = j + 1;
  }
  return scores;
}

function segmentFor(
  scoreR: number,
  scoreF: number,
  scoreM: number,
  orders: number,
  recencyDays: number,
): RfmSegment {
  if (scoreR >= 4 && scoreF >= 4 && scoreM >= 4) return "champions";
  if (scoreF >= 4 && scoreR >= 3) return "loyal";
  if (orders === 1 && recencyDays <= 30) return "new";
  if (scoreF >= 3 && recencyDays > 90) return "at-risk";
  if (recencyDays > 180) return "lost";
  return "regular";
}

export function segmentCustomers(
  orders: RfmOrderInput[],
  now: Date = new Date(),
): RfmResult {
  const nowMs = now.getTime();
  interface Accumulator {
    email: string;
    orders: number;
    totalRevenue: number;
    totalProfit: number;
    firstOrderDate: Date;
    lastOrderDate: Date;
  }
  const byEmail = new Map<string, Accumulator>();

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const email = (order.customerEmail ?? "").trim().toLowerCase();
    if (email === "") continue;
    const date = new Date(order.orderDate);
    if (Number.isNaN(date.getTime())) continue;
    const revenue = toMoney(order.netRevenue);
    const profit = toMoney(order.netProfit);
    const existing = byEmail.get(email);
    if (existing) {
      existing.orders += 1;
      existing.totalRevenue += revenue;
      existing.totalProfit += profit;
      if (date < existing.firstOrderDate) existing.firstOrderDate = date;
      if (date > existing.lastOrderDate) existing.lastOrderDate = date;
    } else {
      byEmail.set(email, {
        email,
        orders: 1,
        totalRevenue: revenue,
        totalProfit: profit,
        firstOrderDate: date,
        lastOrderDate: date,
      });
    }
  }

  const accs = [...byEmail.values()];
  const recencies = accs.map((a) =>
    Math.max(0, Math.floor((nowMs - a.lastOrderDate.getTime()) / DAY_MS)),
  );
  const scoreR = quintileScores(recencies, false);
  const scoreF = quintileScores(
    accs.map((a) => a.orders),
    true,
  );
  const scoreM = quintileScores(
    accs.map((a) => a.totalRevenue),
    true,
  );

  const customers: RfmCustomer[] = accs.map((a, index) => {
    const recencyDays = recencies[index];
    const totalRevenue = round(a.totalRevenue);
    const totalProfit = round(a.totalProfit);
    const r = scoreR[index];
    const f = scoreF[index];
    const m = scoreM[index];
    return {
      email: a.email,
      orders: a.orders,
      totalRevenue,
      totalProfit,
      firstOrderDate: a.firstOrderDate,
      lastOrderDate: a.lastOrderDate,
      recencyDays,
      avgOrderValue: round(totalRevenue / a.orders),
      scoreR: r,
      scoreF: f,
      scoreM: m,
      segment: segmentFor(r, f, m, a.orders, recencyDays),
    };
  });

  // Sort by totalProfit desc; ties break by totalRevenue desc, then
  // email asc, so the order is fully deterministic.
  customers.sort(
    (a, b) =>
      b.totalProfit - a.totalProfit ||
      b.totalRevenue - a.totalRevenue ||
      (a.email < b.email ? -1 : a.email > b.email ? 1 : 0),
  );

  const segments = emptySegments();
  for (const customer of customers) {
    const summary = segments[customer.segment];
    summary.count += 1;
    summary.totalRevenue += customer.totalRevenue;
    summary.totalProfit += customer.totalProfit;
    summary.avgRecencyDays += customer.recencyDays;
  }
  for (const segment of RFM_SEGMENTS) {
    const summary = segments[segment];
    summary.totalRevenue = round(summary.totalRevenue);
    summary.totalProfit = round(summary.totalProfit);
    summary.avgRecencyDays =
      summary.count === 0
        ? 0
        : round(summary.avgRecencyDays / summary.count);
  }

  return { customers, segments };
}
