/**
 * Admin finance math — pure functions over the platform's own
 * Subscription records, so they are unit-testable without a database.
 *
 * Honesty rules baked in here:
 * - There is no stored payment history, so "revenue" is subscription
 *   value (MRR), not collected cash. MRR counts active + trialing +
 *   past_due subscriptions (all non-cancelled, non-paused); past-due
 *   MRR is reported separately as at-risk.
 * - Paddle fees are an ESTIMATE from Paddle's published schedule
 *   (5% + $0.50 per charge). The charge count for a month is the
 *   number of subscriptions whose current period ends in that month.
 * - Profit = MRR − Paddle-fee estimate − recorded platform expenses.
 *   Platform expenses only exist if the superAdmin records them.
 */

export type BillingInterval = "monthly" | "quarterly" | "semiannual" | "annual";
export type SubStatus = "trialing" | "active" | "past_due" | "cancelled" | "paused";

/** The Subscription fields the admin math needs (a plain-object view). */
export interface AdminSubscriptionLike {
  amount: number; // cents
  currency: string;
  interval: BillingInterval;
  status: SubStatus;
  createdAt: Date | string;
  cancelledAt?: Date | string | null;
  currentPeriodEnd?: Date | string | null;
}

/** Paddle's published fee schedule. */
export const PADDLE_FEE_PERCENT = 0.05;
export const PADDLE_FEE_FIXED_USD = 0.5;

/** Monthly value of one subscription, in cents. */
export function monthlyAmountCents(
  sub: Pick<AdminSubscriptionLike, "amount" | "interval">,
): number {
  switch (sub.interval) {
    case "monthly":
      return sub.amount;
    case "quarterly":
      return sub.amount / 3;
    case "semiannual":
      return sub.amount / 6;
    case "annual":
      return sub.amount / 12;
  }
}

/** A subscription counts toward MRR while it is not cancelled/paused. */
export function isRevenueActive(sub: Pick<AdminSubscriptionLike, "status">): boolean {
  return sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
}

/**
 * Convert a cents amount in `currency` to USD dollars.
 * `rates` is units of each currency per 1 USD (the shape getFxRates
 * returns). Returns null when the currency is unknown so the caller
 * can exclude it instead of silently mis-converting it.
 */
export function toUsdDollars(
  amountCents: number,
  currency: string,
  rates: Record<string, number>,
): number | null {
  const code = (currency || "USD").toUpperCase();
  if (code === "USD") return amountCents / 100;
  const rate = rates[code];
  if (!rate || rate <= 0) return null;
  return amountCents / 100 / rate;
}

/** "YYYY-MM" for a date, in UTC. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last 12 "YYYY-MM" keys ending at `now` (oldest first). */
export function last12Months(now: Date = new Date()): string[] {
  const keys: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    keys.push(monthKey(m));
  }
  return keys;
}

export interface MrrMonth {
  month: string;
  /** MRR at month-end, USD. */
  mrr: number;
  /** MRR of subscriptions created in that month, USD. */
  newMrr: number;
  /** MRR of subscriptions cancelled in that month, USD. */
  churnedMrr: number;
}

/**
 * Reconstruct 12 months of MRR from creation/cancellation dates.
 * A subscription counts for a month when it was created on or before
 * the month's end and (not cancelled, or cancelled after the month's
 * end). Status transitions are not stored, so this is a reconstruction
 * from the dates we do have — not a ledger.
 */
export function mrrHistory(
  subs: AdminSubscriptionLike[],
  rates: Record<string, number>,
  now: Date = new Date(),
): MrrMonth[] {
  const months = last12Months(now);
  const monthly = subs.map((s) => ({
    ...s,
    monthlyUsd: toUsdDollars(monthlyAmountCents(s), s.currency, rates),
    created: new Date(s.createdAt),
    cancelled: s.cancelledAt ? new Date(s.cancelledAt) : null,
  }));

  return months.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // last day of month
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    let mrr = 0;
    let newMrr = 0;
    let churnedMrr = 0;
    for (const s of monthly) {
      if (s.monthlyUsd === null) continue;
      // Paused subscriptions cannot be reconstructed (no pause dates
      // are stored), so they are left out of history entirely.
      if (s.status === "paused") continue;
      // Current status must NOT filter history: a subscription
      // cancelled in March was still revenue in January, and the
      // date window below is what decides that.
      if (s.created <= monthEnd && (s.cancelled === null || s.cancelled > monthEnd)) {
        mrr += s.monthlyUsd;
      }
      if (s.created >= monthStart && s.created <= monthEnd) {
        newMrr += s.monthlyUsd;
      }
      if (s.cancelled !== null && s.cancelled >= monthStart && s.cancelled <= monthEnd) {
        churnedMrr += s.monthlyUsd;
      }
    }
    return {
      month: key,
      mrr: round2(mrr),
      newMrr: round2(newMrr),
      churnedMrr: round2(churnedMrr),
    };
  });
}

export interface FeeEstimate {
  /** 5% of the month's expected charges, USD. */
  percentFees: number;
  /** $0.50 per charge landing this month, USD. */
  fixedFees: number;
  /** Total estimated Paddle fees, USD. */
  total: number;
  /** Expected charges landing this month, USD. */
  chargesUsd: number;
  /** Number of charges landing this month. */
  chargeCount: number;
}

/**
 * Estimate this month's Paddle fees. A subscription charges in a month
 * when its current period ends in that month; subscriptions without a
 * period end are assumed to charge monthly. Amounts are converted to
 * USD first; unconvertible subscriptions are excluded from the
 * estimate (their count is reported so the estimate stays honest).
 */
export function paddleFeeEstimate(
  subs: AdminSubscriptionLike[],
  rates: Record<string, number>,
  now: Date = new Date(),
): FeeEstimate & { excludedCount: number } {
  const key = monthKey(now);
  let chargesUsd = 0;
  let chargeCount = 0;
  let excludedCount = 0;
  for (const s of subs) {
    if (!isRevenueActive(s)) continue;
    const periodEnd = s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null;
    const chargesThisMonth = periodEnd === null || monthKey(periodEnd) === key;
    if (!chargesThisMonth) continue;
    // A charge is the full period amount, not the monthly slice.
    const usd = toUsdDollars(s.amount, s.currency, rates);
    if (usd === null) {
      excludedCount++;
      continue;
    }
    chargesUsd += usd;
    chargeCount++;
  }
  const percentFees = chargesUsd * PADDLE_FEE_PERCENT;
  const fixedFees = chargeCount * PADDLE_FEE_FIXED_USD;
  return {
    percentFees: round2(percentFees),
    fixedFees: round2(fixedFees),
    total: round2(percentFees + fixedFees),
    chargesUsd: round2(chargesUsd),
    chargeCount,
    excludedCount,
  };
}

/** Net profit for a month, USD. */
export function profitForMonth(
  mrrUsd: number,
  feesUsd: number,
  expensesUsd: number,
): number {
  return round2(mrrUsd - feesUsd - expensesUsd);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
