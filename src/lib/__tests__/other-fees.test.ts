/**
 * Other-fee rule tests — Phase 1 #22.
 * Proves: matching (effective dates, country, payment method,
 * product tag), percent vs fixed computation, and fixed-fee
 * conversion from the rule's currency into the report base.
 */
import { describe, it, expect } from "vitest";
import {
  ruleMatchesOrder,
  feeForOrder,
  computeOtherFees,
  type OtherFeeRuleInput,
  type OtherFeeOrderInput,
} from "@/lib/other-fees";

const BASE_OPTS = { baseCurrency: "USD", rates: { USD: 1, PKR: 278.5 } };

function order(partial: Partial<OtherFeeOrderInput> = {}): OtherFeeOrderInput {
  return {
    grossRevenue: 1000,
    shippingCountry: "PK",
    paymentMethod: "COD",
    orderDate: "2026-10-15T10:00:00Z",
    status: "fulfilled",
    lineItems: [{ tags: ["fragile"] }],
    ...partial,
  };
}

function rule(partial: Partial<OtherFeeRuleInput> = {}): OtherFeeRuleInput {
  return {
    kind: "fixed_per_order",
    value: 50,
    currency: "USD",
    effectiveFrom: "2026-10-01",
    ...partial,
  };
}

describe("ruleMatchesOrder", () => {
  it("matches an order inside the effective window", () => {
    expect(ruleMatchesOrder(rule(), order())).toBe(true);
  });

  it("rejects orders before effectiveFrom and on/after effectiveTo", () => {
    expect(ruleMatchesOrder(rule(), order({ orderDate: "2026-09-30T23:59:59Z" }))).toBe(false);
    expect(ruleMatchesOrder(rule({ effectiveTo: "2026-10-20" }), order({ orderDate: "2026-10-20T00:00:00Z" }))).toBe(false);
    expect(ruleMatchesOrder(rule({ effectiveTo: "2026-10-20" }), order({ orderDate: "2026-10-19T23:59:59Z" }))).toBe(true);
  });

  it("rejects cancelled orders", () => {
    expect(ruleMatchesOrder(rule(), order({ status: "cancelled" }))).toBe(false);
  });

  it("matches country case-insensitively, and only the stored ISO code", () => {
    expect(ruleMatchesOrder(rule({ country: "pk" }), order())).toBe(true);
    expect(ruleMatchesOrder(rule({ country: "Pakistan" }), order())).toBe(false);
    expect(ruleMatchesOrder(rule({ country: "US" }), order())).toBe(false);
  });

  it("matches payment method case-insensitively", () => {
    expect(ruleMatchesOrder(rule({ paymentMethod: "cod" }), order())).toBe(true);
    expect(ruleMatchesOrder(rule({ paymentMethod: "card" }), order())).toBe(false);
  });

  it("matches a product tag only when a line item carries it", () => {
    expect(ruleMatchesOrder(rule({ productTag: "fragile" }), order())).toBe(true);
    expect(ruleMatchesOrder(rule({ productTag: "heavy" }), order())).toBe(false);
    // Orders carry no tags today: a tagged rule matches nothing.
    expect(ruleMatchesOrder(rule({ productTag: "fragile" }), order({ lineItems: [{ tags: null }] }))).toBe(false);
    expect(ruleMatchesOrder(rule({ productTag: "fragile" }), order({ lineItems: [] }))).toBe(false);
  });
});

describe("feeForOrder", () => {
  it("charges a percent of the base-currency order value", () => {
    const fee = feeForOrder(rule({ kind: "percent", value: 2 }), order({ grossRevenue: 1000 }), BASE_OPTS);
    expect(fee).toBe(20);
  });

  it("charges a fixed fee in the rule currency, converted to base", () => {
    // 278.5 PKR = 1 USD: a 278.5 PKR fixed fee is 1 USD.
    const fee = feeForOrder(rule({ value: 278.5, currency: "PKR" }), order(), BASE_OPTS);
    expect(fee).toBe(1);
  });

  it("charges a same-currency fixed fee with no conversion", () => {
    expect(feeForOrder(rule({ value: 50, currency: "USD" }), order(), BASE_OPTS)).toBe(50);
  });

  it("charges 0 for a non-matching order", () => {
    expect(feeForOrder(rule({ country: "US" }), order(), BASE_OPTS)).toBe(0);
  });
});

describe("computeOtherFees", () => {
  it("sums per-rule and per-order fees", () => {
    const orders = [order(), order({ grossRevenue: 500 }), order({ status: "cancelled", grossRevenue: 9999 })];
    const { total, perRule, perOrder } = computeOtherFees(
      [rule({ value: 10 }), rule({ kind: "percent", value: 10 })],
      orders,
      BASE_OPTS,
    );
    // Rule 1: 10 + 10 + 0 (cancelled). Rule 2: 100 + 50 + 0.
    expect(perRule).toEqual([20, 150]);
    expect(perOrder).toEqual([110, 60, 0]);
    expect(total).toBe(170);
  });
});
