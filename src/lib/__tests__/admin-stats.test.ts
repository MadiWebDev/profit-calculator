import { describe, it, expect } from "vitest";
import {
  monthlyAmountCents,
  isRevenueActive,
  toUsdDollars,
  mrrHistory,
  paddleFeeEstimate,
  profitForMonth,
  last12Months,
  type AdminSubscriptionLike,
} from "../admin-stats";

const usd = (amount: number, interval: AdminSubscriptionLike["interval"] = "monthly") => ({
  amount,
  currency: "USD",
  interval,
  status: "active" as const,
  createdAt: new Date("2026-01-15T00:00:00Z"),
});

describe("monthlyAmountCents", () => {
  it("returns the amount for monthly", () => {
    expect(monthlyAmountCents({ amount: 1800, interval: "monthly" })).toBe(1800);
  });
  it("divides quarterly by 3, semiannual by 6, annual by 12", () => {
    expect(monthlyAmountCents({ amount: 4860, interval: "quarterly" })).toBe(1620);
    expect(monthlyAmountCents({ amount: 9180, interval: "semiannual" })).toBe(1530);
    expect(monthlyAmountCents({ amount: 17280, interval: "annual" })).toBe(1440);
  });
});

describe("isRevenueActive", () => {
  it("counts active, trialing and past_due; not cancelled or paused", () => {
    expect(isRevenueActive({ status: "active" })).toBe(true);
    expect(isRevenueActive({ status: "trialing" })).toBe(true);
    expect(isRevenueActive({ status: "past_due" })).toBe(true);
    expect(isRevenueActive({ status: "cancelled" })).toBe(false);
    expect(isRevenueActive({ status: "paused" })).toBe(false);
  });
});

describe("toUsdDollars", () => {
  it("converts cents to dollars for USD", () => {
    expect(toUsdDollars(1800, "USD", {})).toBe(18);
  });
  it("divides by the per-USD rate for other currencies", () => {
    expect(toUsdDollars(278500, "PKR", { PKR: 278.5 })).toBe(10);
  });
  it("returns null for an unknown currency instead of mis-converting", () => {
    expect(toUsdDollars(1000, "XXX", { PKR: 278.5 })).toBeNull();
  });
});

describe("mrrHistory", () => {
  const rates = {};
  it("reconstructs MRR at each month-end from creation/cancellation dates", () => {
    const subs: AdminSubscriptionLike[] = [
      // $18/mo since January, still active
      { ...usd(1800), createdAt: new Date("2026-01-10T00:00:00Z") },
      // $29/mo since March, cancelled in May (still revenue Jan–Apr? no — created March)
      {
        ...usd(2900),
        createdAt: new Date("2026-03-05T00:00:00Z"),
        cancelledAt: new Date("2026-05-20T00:00:00Z"),
        status: "cancelled",
      },
    ];
    const history = mrrHistory(subs, rates, new Date("2026-06-15T00:00:00Z"));
    expect(history).toHaveLength(12);
    const byMonth = Object.fromEntries(history.map((h) => [h.month, h]));
    expect(byMonth["2026-01"].mrr).toBe(18);
    expect(byMonth["2026-02"].mrr).toBe(18);
    expect(byMonth["2026-03"].mrr).toBe(47); // 18 + 29
    expect(byMonth["2026-03"].newMrr).toBe(29);
    expect(byMonth["2026-04"].mrr).toBe(47);
    expect(byMonth["2026-05"].mrr).toBe(18); // cancelled 20 May, gone at month-end
    expect(byMonth["2026-05"].churnedMrr).toBe(29);
    expect(byMonth["2026-06"].mrr).toBe(18);
  });

  it("excludes paused subscriptions from history", () => {
    const subs: AdminSubscriptionLike[] = [
      { ...usd(1800), status: "paused", createdAt: new Date("2026-01-10T00:00:00Z") },
    ];
    const history = mrrHistory(subs, rates, new Date("2026-06-15T00:00:00Z"));
    expect(history.every((h) => h.mrr === 0)).toBe(true);
  });

  it("annual plans count at their monthly slice", () => {
    const subs: AdminSubscriptionLike[] = [
      { ...usd(17280, "annual"), createdAt: new Date("2026-02-01T00:00:00Z") },
    ];
    const history = mrrHistory(subs, rates, new Date("2026-06-15T00:00:00Z"));
    const byMonth = Object.fromEntries(history.map((h) => [h.month, h]));
    expect(byMonth["2026-02"].mrr).toBe(14.4);
    expect(byMonth["2026-06"].mrr).toBe(14.4);
  });
});

describe("paddleFeeEstimate", () => {
  it("charges 5% + $0.50 per subscription whose period ends this month", () => {
    const subs: AdminSubscriptionLike[] = [
      // $18 monthly, period ends this month -> charges $18
      { ...usd(1800), currentPeriodEnd: new Date("2026-06-20T00:00:00Z") },
      // $29 monthly, period ends next month -> no charge this month
      { ...usd(2900), currentPeriodEnd: new Date("2026-07-01T00:00:00Z") },
      // cancelled -> never charges
      {
        ...usd(1800),
        status: "cancelled",
        currentPeriodEnd: new Date("2026-06-20T00:00:00Z"),
      },
    ];
    const fee = paddleFeeEstimate(subs, {}, new Date("2026-06-15T00:00:00Z"));
    expect(fee.chargeCount).toBe(1);
    expect(fee.chargesUsd).toBe(18);
    expect(fee.percentFees).toBe(0.9);
    expect(fee.fixedFees).toBe(0.5);
    expect(fee.total).toBe(1.4);
  });

  it("treats a missing period end as a monthly charge", () => {
    const subs: AdminSubscriptionLike[] = [{ ...usd(1800), currentPeriodEnd: null }];
    const fee = paddleFeeEstimate(subs, {}, new Date("2026-06-15T00:00:00Z"));
    expect(fee.chargeCount).toBe(1);
  });
});

describe("profitForMonth", () => {
  it("is MRR minus fees minus recorded expenses", () => {
    expect(profitForMonth(100, 5.5, 20)).toBe(74.5);
    expect(profitForMonth(10, 5.5, 20)).toBe(-15.5);
  });
});

describe("last12Months", () => {
  it("returns 12 keys ending at the current month", () => {
    const keys = last12Months(new Date("2026-06-15T00:00:00Z"));
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2025-07");
    expect(keys[11]).toBe("2026-06");
  });
});
