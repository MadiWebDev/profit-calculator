import { describe, it, expect } from "vitest";
import {
  calcTrueNetProfit,
  calcDashboardMetrics,
  normalizeTaxInclusive,
  allocatePerOrder,
  allocatePerDay,
  codSplit,
  reorderSuggestion,
  periodDelta,
  toBaseCurrency,
  type ExtendedOrderInput,
} from "@/lib/profit-extended";

function base(overrides: Partial<ExtendedOrderInput> = {}): ExtendedOrderInput {
  return {
    grossRevenue: 100,
    discounts: 0,
    shippingRevenue: 0,
    shippingCost: 5,
    totalCogs: 30,
    transactionFees: 3,
    taxes: 0,
    refundAmount: 0,
    chargebackAmount: 0,
    adSpendAllocated: 10,
    ...overrides,
  };
}

describe("calcTrueNetProfit", () => {
  it("sums every cost line exactly once", () => {
    const b = calcTrueNetProfit(
      base({ packagingCost: 2, codFee: 1, subscriptionShare: 0.5, rtoLoss: 0, expenseAllocation: 4, otherCosts: 1 })
    );
    // 100 - 30 - 5 - 3 - 1 - 0.5 - 2 - 10 - 4 - 1 = 43.5
    expect(b.netProfit).toBe(43.5);
    expect(b.netMargin).toBe(43.5);
    expect(b.cogs).toBe(30);
    expect(b.packagingCost).toBe(2);
  });

  it("partial refund reduces revenue and profit, not COGS", () => {
    const b = calcTrueNetProfit(base({ refundAmount: 40 }));
    expect(b.netRevenue).toBe(60);
    expect(b.netProfit).toBe(12); // 60-30-5-3-10
    expect(b.cogs).toBe(30);
  });

  it("discounts are a memo: already reflected in revenue, never subtracted again", () => {
    const b = calcTrueNetProfit(base({ grossRevenue: 90, discounts: 10 }));
    expect(b.netRevenue).toBe(90);
    expect(b.netProfit).toBe(42);
  });

  it("RTO loss is shipping + packaging lost, on top of other costs", () => {
    const b = calcTrueNetProfit(base({ rtoLoss: 7 }));
    expect(b.rtoLoss).toBe(7);
    expect(b.netProfit).toBe(45); // 100-30-5-3-10-7
  });

  it("zero-cost items and zero revenue never produce NaN", () => {
    const b = calcTrueNetProfit(base({ grossRevenue: 0, totalCogs: 0, shippingCost: 0, transactionFees: 0, adSpendAllocated: 0 }));
    expect(b.netProfit).toBe(0);
    expect(b.netMargin).toBe(0);
  });

  it("tax-inclusive mode splits tax out before the formula runs", () => {
    const split = normalizeTaxInclusive(120, 20);
    expect(split.grossRevenue).toBe(100);
    expect(split.taxes).toBe(20);
    const b = calcTrueNetProfit(base({ grossRevenue: 120, taxMode: "inclusive", taxRatePercent: 20 }));
    expect(b.revenue).toBe(100);
    expect(b.taxes).toBe(20);
    expect(b.netProfit).toBe(52); // 100-30-5-3-10
  });

  it("multi-currency: convert first, then the same formula holds", () => {
    // Order in EUR at 1.1 USD/EUR, converted to USD at order time.
    const usd = toBaseCurrency(100, 1.1);
    expect(usd).toBe(110);
    const b = calcTrueNetProfit(base({ grossRevenue: usd, totalCogs: 33, shippingCost: 5.5, transactionFees: 3.3, adSpendAllocated: 11 }));
    expect(b.netProfit).toBe(57.2);
  });
});

describe("calcDashboardMetrics", () => {
  it("excludes cancelled orders by default and reports COD cash split", () => {
    const m = calcDashboardMetrics([
      { ...base(), status: "fulfilled", customerKey: "c1", isFirstOrder: true, codCollected: 50, codPending: 50 },
      { ...base({ grossRevenue: 200 }), status: "cancelled", customerKey: "c2", isFirstOrder: true },
      { ...base(), status: "fulfilled", customerKey: "c1", isFirstOrder: false, isRto: true, rtoLoss: 7 },
    ]);
    expect(m.orderCount).toBe(2);
    expect(m.revenue).toBe(200);
    expect(m.cashCollected).toBe(50);
    expect(m.cashPending).toBe(50);
    expect(m.rtoRate).toBe(50);
    expect(m.repeatCustomers).toBe(1);
    expect(m.cac).toBe(20); // ad spend 20 / 1 new customer
  });

  it("break-even ROAS covers non-ad costs", () => {
    const m = calcDashboardMetrics([{ ...base() }]);
    expect(m.roas).toBe(10); // 100 / 10
    // (10 + 30+5+3) / 10 = 4.8
    expect(m.breakEvenRoas).toBe(4.8);
    expect(m.aov).toBe(100);
  });

  it("empty input is all zeros, never NaN", () => {
    const m = calcDashboardMetrics([]);
    expect(m).toMatchObject({ revenue: 0, netProfit: 0, orderCount: 0, aov: 0, roas: 0, cac: 0 });
  });
});

describe("helpers", () => {
  it("expense allocation divides evenly and guards zero counts", () => {
    expect(allocatePerOrder(1000, 100)).toBe(10);
    expect(allocatePerOrder(1000, 0)).toBe(0);
    expect(allocatePerDay(300, 30)).toBe(10);
    expect(allocatePerDay(300, 0)).toBe(0);
  });

  it("COD split caps collected at the total", () => {
    expect(codSplit(100, 150)).toEqual({ collected: 100, pending: 0 });
    expect(codSplit(100, 30)).toEqual({ collected: 30, pending: 70 });
  });

  it("reorder suggestion flags critical stock", () => {
    const s = reorderSuggestion({ onHand: 5, soldLast30Days: 30, leadTimeDays: 7, safetyDays: 7 });
    expect(s.dailyRate).toBe(1);
    expect(s.daysOfStock).toBe(5);
    expect(s.risk).toBe("critical");
    expect(s.suggestedQty).toBeGreaterThan(0);
    const ok = reorderSuggestion({ onHand: 100, soldLast30Days: 30 });
    expect(ok.risk).toBe("ok");
  });

  it("period delta handles a zero previous period", () => {
    expect(periodDelta(50, 0)).toBe(100);
    expect(periodDelta(0, 0)).toBe(0);
    expect(periodDelta(150, 100)).toBe(50);
  });
});
