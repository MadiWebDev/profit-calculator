/**
 * Profit engine tests — Phase 5.
 *
 * Golden tests: hand-computed expectations for every public function.
 * Property tests (fast-check): identities that must hold for ALL inputs.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  calcOrderProfit,
  calcLineItemsCogs,
  calcTransactionFees,
  calcPeriodSummary,
  calcSimulator,
  calcAdMetrics,
  calcBundleMargin,
  calcTaxSetAside,
  calcProductSummaries,
  calcCustomerLtv,
  convertCurrency,
  convertOrderCosts,
  toMoney,
  round,
  type OrderCosts,
} from "@/lib/profit-engine";

const baseOrder: OrderCosts = {
  grossRevenue: 100,
  discounts: 10,          // memo — already inside grossRevenue
  shippingRevenue: 5,     // memo — already inside grossRevenue
  shippingCost: 4,
  totalCogs: 40,
  transactionFees: 3.2,
  taxes: 8,               // memo — pass-through
  refundAmount: 0,
  chargebackAmount: 0,
  adSpendAllocated: 0,
};

// ─── Golden tests ───────────────────────────────────────────────────────────

describe("calcOrderProfit — golden", () => {
  it("standard order", () => {
    const r = calcOrderProfit(baseOrder);
    expect(r.netRevenue).toBe(100);
    expect(r.grossProfit).toBe(60);
    expect(r.grossMargin).toBe(60);
    expect(r.totalCosts).toBe(47.2);
    expect(r.netProfit).toBe(52.8);
    expect(r.netMargin).toBe(52.8);
  });

  it("discounts are a memo — never subtracted again", () => {
    const r = calcOrderProfit({ ...baseOrder, discounts: 999 });
    expect(r.netRevenue).toBe(100);
    expect(r.netProfit).toBe(52.8);
  });

  it("taxes are pass-through — excluded from revenue", () => {
    const r = calcOrderProfit({ ...baseOrder, taxes: 999 });
    expect(r.netRevenue).toBe(100);
    expect(r.netProfit).toBe(52.8);
  });

  it("shippingRevenue is a memo — never added again", () => {
    const r = calcOrderProfit({ ...baseOrder, shippingRevenue: 999 });
    expect(r.netRevenue).toBe(100);
  });

  it("partial refund reduces net revenue", () => {
    const r = calcOrderProfit({ ...baseOrder, refundAmount: 30 });
    expect(r.netRevenue).toBe(70);
    expect(r.grossProfit).toBe(30);
    expect(r.grossMargin).toBeCloseTo(42.86, 2);
    expect(r.netProfit).toBeCloseTo(22.8, 2);
    expect(r.netMargin).toBeCloseTo(32.57, 2);
  });

  it("full refund: zero revenue, negative profit (costs already incurred)", () => {
    const r = calcOrderProfit({ ...baseOrder, refundAmount: 100 });
    expect(r.netRevenue).toBe(0);
    expect(r.grossMargin).toBe(0);
    expect(r.netMargin).toBe(0);
    expect(r.netProfit).toBe(-47.2);
  });

  it("full chargeback zeroes revenue", () => {
    const r = calcOrderProfit({ ...baseOrder, grossRevenue: 200, chargebackAmount: 200 });
    expect(r.netRevenue).toBe(0);
    expect(r.netProfit).toBe(-47.2);
  });

  it("all zeros", () => {
    const r = calcOrderProfit({
      grossRevenue: 0, discounts: 0, shippingRevenue: 0, shippingCost: 0,
      totalCogs: 0, transactionFees: 0, taxes: 0, refundAmount: 0,
      chargebackAmount: 0, adSpendAllocated: 0,
    });
    expect(r).toEqual({
      netRevenue: 0, grossProfit: 0, grossMargin: 0,
      netProfit: 0, netMargin: 0, totalCosts: 0,
    });
  });

  it("NaN/Infinity inputs are sanitized, never propagate", () => {
    const r = calcOrderProfit({
      ...baseOrder,
      grossRevenue: NaN,
      totalCogs: Infinity,
      shippingCost: undefined as unknown as number,
    });
    for (const v of Object.values(r)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(r.netRevenue).toBe(0);
  });

  it("ad spend and other costs reduce profit", () => {
    const r = calcOrderProfit({ ...baseOrder, adSpendAllocated: 10, otherCosts: 2.5 });
    expect(r.totalCosts).toBe(59.7);
    expect(r.netProfit).toBe(40.3);
  });
});

describe("calcLineItemsCogs / calcTransactionFees — golden", () => {
  it("sums quantity-weighted cogs", () => {
    expect(
      calcLineItemsCogs([
        { price: 25, cogs: 10, quantity: 3 },
        { price: 15, cogs: 4, quantity: 2 },
      ])
    ).toBe(38);
  });

  it("empty list is zero", () => {
    expect(calcLineItemsCogs([])).toBe(0);
  });

  it("platform + gateway % + fixed fee", () => {
    // (2 + 2.9)% of 100 + 0.30 = 5.20
    expect(calcTransactionFees(100, 2, 2.9, 0.3)).toBe(5.2);
  });

  it("zero order value still charges the fixed fee", () => {
    expect(calcTransactionFees(0, 2, 2.9, 0.3)).toBe(0.3);
  });
});

describe("calcPeriodSummary — golden", () => {
  const orders: OrderCosts[] = [
    baseOrder,
    { ...baseOrder, grossRevenue: 200, totalCogs: 90, refundAmount: 20 },
  ];

  it("aggregates with the same formula as per-order", () => {
    const p = calcPeriodSummary(orders);
    expect(p.orderCount).toBe(2);
    expect(p.totalRevenue).toBe(300);
    expect(p.totalRefunds).toBe(20);
    expect(p.totalCogs).toBe(130);
    // netRevenue = 300 - 20 = 280; grossProfit = 280 - 130 = 150
    expect(p.grossProfit).toBe(150);
    expect(p.grossMargin).toBeCloseTo(53.57, 2);
    // totalCosts = 130 + 8 + 6.4 + 0 + 0 = 144.4; netProfit = 280 - 144.4 = 135.6
    expect(p.netProfit).toBeCloseTo(135.6, 2);
    expect(p.avgOrderValue).toBe(140);
    expect(p.avgNetProfit).toBeCloseTo(67.8, 2);
  });

  it("empty period", () => {
    const p = calcPeriodSummary([]);
    expect(p.orderCount).toBe(0);
    expect(p.netProfit).toBe(0);
    expect(p.avgOrderValue).toBe(0);
  });

  it("period netProfit equals sum of order netProfits (additivity)", () => {
    const p = calcPeriodSummary(orders);
    const sum = orders
      .map((o) => calcOrderProfit(o).netProfit)
      .reduce((a, b) => a + b, 0);
    expect(p.netProfit).toBeCloseTo(sum, 2);
  });
});

describe("calcSimulator — golden", () => {
  it("standard case", () => {
    const r = calcSimulator({
      sellingPrice: 50, cogs: 15, shippingCost: 5,
      transactionFeePercent: 2.9, transactionFeeFixed: 0.3,
      platformFeePercent: 0, adSpendPerUnit: 8,
      quantity: 100, refundRatePercent: 2,
    });
    // fees = 2.9% of 50 + 0.30 = 1.75; refund/unit = 1.00
    // effective = 15 + 5 + 1.75 + 8 + 1 = 30.75
    expect(r.effectiveCostPerUnit).toBe(30.75);
    expect(r.profitPerUnit).toBe(19.25);
    expect(r.profitMargin).toBe(38.5);
    expect(r.totalRevenue).toBe(5000);
    expect(r.totalProfit).toBe(1925);
    expect(r.totalFees).toBe(175);
  });

  it("100% refund rate: break-even price stays finite", () => {
    const r = calcSimulator({
      sellingPrice: 50, cogs: 15, shippingCost: 5,
      transactionFeePercent: 2.9, transactionFeeFixed: 0.3,
      platformFeePercent: 0, adSpendPerUnit: 8,
      quantity: 100, refundRatePercent: 100,
    });
    expect(Number.isFinite(r.breakEvenPrice)).toBe(true);
    expect(Number.isFinite(r.profitPerUnit)).toBe(true);
  });

  it("totalProfit = profitPerUnit × quantity", () => {
    const r = calcSimulator({
      sellingPrice: 40, cogs: 12, shippingCost: 4,
      transactionFeePercent: 2.9, transactionFeeFixed: 0.3,
      platformFeePercent: 1, adSpendPerUnit: 5,
      quantity: 37, refundRatePercent: 3,
    });
    expect(r.totalProfit).toBeCloseTo(r.profitPerUnit * 37, 2);
  });
});

describe("calcAdMetrics — golden", () => {
  it("standard case", () => {
    const r = calcAdMetrics({
      totalSpend: 1000, totalRevenue: 4000,
      totalCogs: 1500, totalFees: 200, conversions: 50,
    });
    expect(r.roas).toBe(4);
    expect(r.netProfit).toBe(1300);
    expect(r.netMargin).toBe(32.5);
    expect(r.cpa).toBe(20);
    expect(r.breakEvenRoas).toBe(2.7);
    expect(r.roi).toBeCloseTo(48.15, 2);
  });

  it("zero spend: no division by zero", () => {
    const r = calcAdMetrics({
      totalSpend: 0, totalRevenue: 1000,
      totalCogs: 400, totalFees: 50, conversions: 0,
    });
    expect(r.roas).toBe(0);
    expect(r.breakEvenRoas).toBe(0);
    expect(r.cpa).toBe(0);
    expect(r.netProfit).toBe(550);
  });
});

describe("calcBundleMargin — golden", () => {
  it("matches the old inline bundle math", () => {
    const r = calcBundleMargin(
      [{ cogs: 10, quantity: 2 }, { cogs: 5, quantity: 1 }],
      50, 5
    );
    expect(r.totalCogs).toBe(25);
    expect(r.grossProfit).toBe(25);
    expect(r.grossMargin).toBe(50);
    expect(r.fees).toBe(2.5);
    expect(r.netProfit).toBe(22.5);
    expect(r.netMargin).toBe(45);
  });

  it("zero selling price", () => {
    const r = calcBundleMargin([{ cogs: 10, quantity: 1 }], 0, 5);
    expect(r.grossMargin).toBe(0);
    expect(r.netMargin).toBe(0);
    expect(r.netProfit).toBe(-10);
  });
});

describe("calcTaxSetAside — golden", () => {
  it("standard", () => {
    const r = calcTaxSetAside(10000, 0.28);
    expect(r.taxSetAside).toBe(2800);
    expect(r.afterTaxProfit).toBe(7200);
    expect(r.quarterlyPayment).toBe(700);
  });

  it("loss: no set-aside", () => {
    const r = calcTaxSetAside(-5000);
    expect(r.taxSetAside).toBe(0);
    expect(r.afterTaxProfit).toBe(-5000);
  });
});

describe("calcProductSummaries — golden", () => {
  it("aggregates units and margins per product", () => {
    const [a, b] = calcProductSummaries([
      { productId: "p1", name: "Widget", price: 30, cogs: 12, quantity: 2 },
      { productId: "p1", name: "Widget", price: 30, cogs: 12, quantity: 1 },
      { productId: "p2", name: "Gadget", price: 50, cogs: 40, quantity: 1 },
    ]);
    expect(a.totalRevenue).toBe(90);
    expect(a.totalProfit).toBe(54);
    expect(a.avgProfitMargin).toBe(60);
    expect(a.avgSellingPrice).toBe(30);
    expect(a.totalOrders).toBe(3);
    expect(b.totalProfit).toBe(10);
    expect(b.avgProfitMargin).toBe(20);
  });
});

describe("calcCustomerLtv — golden", () => {
  it("empty history", () => {
    expect(calcCustomerLtv([])).toEqual({
      totalProfit: 0, orderCount: 0, avgOrderProfit: 0,
      daysSinceFirstOrder: 0, estimatedAnnualLtv: 0,
    });
  });

  it("two orders ten days apart", () => {
    const r = calcCustomerLtv([
      { netProfit: 20, orderDate: new Date("2026-01-01") },
      { netProfit: 30, orderDate: new Date("2026-01-11") },
    ]);
    expect(r.totalProfit).toBe(50);
    expect(r.orderCount).toBe(2);
    expect(r.avgOrderProfit).toBe(25);
    expect(r.daysSinceFirstOrder).toBe(10);
    // 2 orders / 10 days * 365 * 25
    expect(r.estimatedAnnualLtv).toBe(1825);
  });
});

describe("FX — golden", () => {
  const rates = { USD: 1, EUR: 0.92, PKR: 278.5 };

  it("converts USD -> EUR", () => {
    expect(convertCurrency(100, "USD", "EUR", rates)).toBe(92);
  });

  it("converts EUR -> USD", () => {
    expect(convertCurrency(92, "EUR", "USD", rates)).toBe(100);
  });

  it("same currency is exact — no rounding drift", () => {
    expect(convertCurrency(123.456, "EUR", "EUR", rates)).toBe(123.46);
    expect(convertCurrency(123.456, "eur", "EUR", rates)).toBe(123.46);
  });

  it("throws on unknown currency", () => {
    expect(() => convertCurrency(100, "USD", "XXX", rates)).toThrow();
    expect(() => convertCurrency(100, "XXX", "USD", rates)).toThrow();
  });

  it("convertOrderCosts converts every field", () => {
    const c = convertOrderCosts(baseOrder, "USD", "EUR", rates);
    expect(c.grossRevenue).toBe(92);
    expect(c.totalCogs).toBe(36.8);
    expect(c.otherCosts).toBeUndefined();
    const withOther = convertOrderCosts(
      { ...baseOrder, otherCosts: 10 }, "USD", "EUR", rates
    );
    expect(withOther.otherCosts).toBe(9.2);
  });
});

describe("toMoney / round — golden", () => {
  it("coerces non-finite to 0", () => {
    expect(toMoney(NaN)).toBe(0);
    expect(toMoney(Infinity)).toBe(0);
    expect(toMoney(undefined)).toBe(0);
    expect(toMoney(null)).toBe(0);
    expect(toMoney("12.5")).toBe(12.5);
  });

  it("round never returns NaN/Infinity", () => {
    expect(round(NaN)).toBe(0);
    expect(round(Infinity)).toBe(0);
    expect(round(2.675)).toBe(2.68); // classic float trap
  });
});

// ─── Property tests ─────────────────────────────────────────────────────────

const arbMoney = fc.double({ min: 0, max: 1_000_000, noNaN: true });
const arbOrderCosts = fc.record({
  grossRevenue: arbMoney,
  discounts: arbMoney,
  shippingRevenue: arbMoney,
  shippingCost: arbMoney,
  totalCogs: arbMoney,
  transactionFees: arbMoney,
  taxes: arbMoney,
  refundAmount: arbMoney,
  chargebackAmount: arbMoney,
  adSpendAllocated: arbMoney,
  otherCosts: fc.option(arbMoney, { nil: undefined }),
});

describe("profit engine — properties", () => {
  it("netProfit = netRevenue − totalCosts (identity)", () => {
    fc.assert(
      fc.property(arbOrderCosts, (costs) => {
        const r = calcOrderProfit(costs);
        expect(r.netProfit).toBeCloseTo(r.netRevenue - r.totalCosts, 2);
      })
    );
  });

  it("grossProfit = netRevenue − totalCogs (identity)", () => {
    fc.assert(
      fc.property(arbOrderCosts, (costs) => {
        const r = calcOrderProfit(costs);
        expect(r.grossProfit).toBeCloseTo(r.netRevenue - costs.totalCogs, 2);
      })
    );
  });

  it("margins are 0 when net revenue ≤ 0, otherwise match the ratio", () => {
    fc.assert(
      fc.property(arbOrderCosts, (costs) => {
        const r = calcOrderProfit(costs);
        if (r.netRevenue <= 0) {
          expect(r.grossMargin).toBe(0);
          expect(r.netMargin).toBe(0);
        } else {
          expect(r.grossMargin).toBeCloseTo((r.grossProfit / r.netRevenue) * 100, 2);
          expect(r.netMargin).toBeCloseTo((r.netProfit / r.netRevenue) * 100, 2);
        }
      })
    );
  });

  it("period netProfit = Σ order netProfits (additivity)", () => {
    fc.assert(
      fc.property(fc.array(arbOrderCosts, { minLength: 1, maxLength: 20 }), (orders) => {
        const p = calcPeriodSummary(orders);
        const sum = orders.reduce((a, o) => a + calcOrderProfit(o).netProfit, 0);
        expect(p.netProfit).toBeCloseTo(sum, 1);
      })
    );
  });

  it("period grossProfit = Σ order grossProfits (additivity)", () => {
    fc.assert(
      fc.property(fc.array(arbOrderCosts, { minLength: 1, maxLength: 20 }), (orders) => {
        const p = calcPeriodSummary(orders);
        const sum = orders.reduce((a, o) => a + calcOrderProfit(o).grossProfit, 0);
        expect(p.grossProfit).toBeCloseTo(sum, 1);
      })
    );
  });

  it("discounts/taxes/shippingRevenue never affect profit (memo fields)", () => {
    fc.assert(
      fc.property(arbOrderCosts, arbMoney, arbMoney, arbMoney, (costs, d, t, s) => {
        const a = calcOrderProfit(costs);
        const b = calcOrderProfit({ ...costs, discounts: d, taxes: t, shippingRevenue: s });
        expect(b.netProfit).toBe(a.netProfit);
        expect(b.netRevenue).toBe(a.netRevenue);
      })
    );
  });

  it("round is idempotent", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (n) => {
        expect(round(round(n))).toBe(round(n));
      })
    );
  });

  it("FX round-trip returns the original amount", () => {
    const rates = { USD: 1, EUR: 0.92, GBP: 0.79, PKR: 278.5 };
    fc.assert(
      fc.property(arbMoney, (amount) => {
        const there = convertCurrency(amount, "USD", "PKR", rates);
        const back = convertCurrency(there, "PKR", "USD", rates);
        expect(back).toBeCloseTo(round(amount), 2);
      })
    );
  });

  it("FX conversion is linear: convert-then-calc = calc-then-convert", () => {
    const rates = { USD: 1, EUR: 0.92 };
    fc.assert(
      fc.property(arbOrderCosts, (costs) => {
        const a = calcOrderProfit(convertOrderCosts(costs, "USD", "EUR", rates));
        const b = calcOrderProfit(costs);
        expect(a.netProfit).toBeCloseTo(convertCurrency(b.netProfit, "USD", "EUR", rates), 1);
        expect(a.netRevenue).toBeCloseTo(convertCurrency(b.netRevenue, "USD", "EUR", rates), 1);
      })
    );
  });

  it("simulator: totalProfit = profitPerUnit × quantity (within rounding)", () => {
    fc.assert(
      fc.property(
        fc.record({
          sellingPrice: arbMoney,
          cogs: arbMoney,
          shippingCost: arbMoney,
          transactionFeePercent: fc.double({ min: 0, max: 10, noNaN: true }),
          transactionFeeFixed: fc.double({ min: 0, max: 5, noNaN: true }),
          platformFeePercent: fc.double({ min: 0, max: 15, noNaN: true }),
          adSpendPerUnit: arbMoney,
          quantity: fc.integer({ min: 0, max: 10000 }),
          refundRatePercent: fc.double({ min: 0, max: 100, noNaN: true }),
        }),
        (input) => {
          const r = calcSimulator(input);
          // Each output is rounded once (≤0.005 error); the per-unit rounding
          // is amplified by quantity when multiplied out.
          const bound = 0.005 * input.quantity + 0.01;
          expect(Math.abs(r.totalProfit - r.profitPerUnit * input.quantity)).toBeLessThanOrEqual(bound);
          expect(Number.isFinite(r.breakEvenPrice)).toBe(true);
          expect(Number.isFinite(r.profitPerUnit)).toBe(true);
        }
      )
    );
  });

  it("no engine output is ever NaN or Infinity", () => {
    fc.assert(
      fc.property(arbOrderCosts, (costs) => {
        const r = calcOrderProfit(costs);
        for (const v of Object.values(r)) {
          expect(Number.isFinite(v)).toBe(true);
        }
        const p = calcPeriodSummary([costs]);
        for (const v of Object.values(p)) {
          expect(Number.isFinite(v as number)).toBe(true);
        }
      })
    );
  });
});
