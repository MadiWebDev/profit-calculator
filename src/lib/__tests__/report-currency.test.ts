/**
 * Per-order currency conversion for report aggregation.
 *
 * The core rule: convert each order into the base currency BEFORE
 * summing. A EUR order and a GBP order must never be summed 1:1 and
 * labelled with one currency.
 */
import { describe, it, expect } from "vitest";
import { convertOrdersToBase, sumCosts } from "@/lib/report-currency";

const RATES = { USD: 1, EUR: 0.92, GBP: 0.79, PKR: 278.5 };

function order(currency: string, gross: number, cogs = 0) {
  return {
    currency,
    grossRevenue: gross,
    discounts: 0,
    shippingRevenue: 0,
    shippingCost: 0,
    totalCogs: cogs,
    transactionFees: 0,
    taxes: 0,
    refundAmount: 0,
    chargebackAmount: 0,
    adSpendAllocated: 0,
  };
}

describe("convertOrdersToBase", () => {
  it("converts each order from its own currency before summing", () => {
    // 92 EUR = 100 USD, 79 GBP = 100 USD at the test rates.
    const converted = convertOrdersToBase(
      [order("EUR", 92), order("GBP", 79)],
      "USD",
      RATES,
    );
    const sums = sumCosts(converted);
    expect(sums.grossRevenue).toBeCloseTo(200, 6);
  });

  it("leaves single-currency orders exact", () => {
    const converted = convertOrdersToBase([order("USD", 123.45)], "USD", RATES);
    expect(converted[0].grossRevenue).toBe(123.45);
  });

  it("passes orders through unchanged when rates are unavailable", () => {
    const converted = convertOrdersToBase([order("EUR", 92)], "USD", null);
    expect(converted[0].grossRevenue).toBe(92);
  });

  it("keeps an order with an unknown currency instead of dropping it", () => {
    const converted = convertOrdersToBase([order("XXX", 50)], "USD", RATES);
    expect(converted[0].grossRevenue).toBe(50);
  });

  it("does not assume USD: a USD order converts into a EUR base", () => {
    const converted = convertOrdersToBase([order("USD", 100)], "EUR", RATES);
    expect(converted[0].grossRevenue).toBe(92);
  });
});
