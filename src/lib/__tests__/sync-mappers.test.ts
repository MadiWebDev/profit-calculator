/**
 * Pure-function tests for the sync libraries extracted in Phase 4:
 * Etsy / WooCommerce order-status mapping and money parsing edge cases.
 */
import { describe, it, expect } from "vitest";
import { mapEtsyStatus, type EtsyReceipt } from "@/lib/sync/etsy";
import { mapWooStatus } from "@/lib/sync/woocommerce";

function etsyReceipt(overrides: Record<string, unknown> = {}): EtsyReceipt {
  return {
    receipt_id: 1,
    status: "paid",
    is_shipped: false,
    is_paid: true,
    create_timestamp: 1700000000,
    currency_code: "USD",
    grandtotal: { amount: 10000, divisor: 100, currency_code: "USD" },
    subtotal: { amount: 9000, divisor: 100, currency_code: "USD" },
    total_price: { amount: 9000, divisor: 100, currency_code: "USD" },
    total_shipping_cost: { amount: 500, divisor: 100, currency_code: "USD" },
    total_tax_cost: { amount: 500, divisor: 100, currency_code: "USD" },
    discount_amt: { amount: 0, divisor: 100, currency_code: "USD" },
    buyer_user_id: 42,
    transactions: [],
    ...overrides,
  } as EtsyReceipt;
}

describe("mapEtsyStatus", () => {
  it("maps canceled receipts to cancelled", () => {
    expect(mapEtsyStatus(etsyReceipt({ status: "canceled" }))).toBe("cancelled");
  });

  it("maps unpaid receipts to pending", () => {
    expect(mapEtsyStatus(etsyReceipt({ is_paid: false }))).toBe("pending");
  });

  it("maps paid receipts to fulfilled", () => {
    expect(mapEtsyStatus(etsyReceipt())).toBe("fulfilled");
  });

  it("maps fully refunded receipts to refunded", () => {
    expect(
      mapEtsyStatus(
        etsyReceipt({
          refunds: [{ amount: { amount: 10000, divisor: 100, currency_code: "USD" }, created_timestamp: 1700000100 }],
        })
      )
    ).toBe("refunded");
  });

  it("keeps partially refunded receipts as fulfilled", () => {
    expect(
      mapEtsyStatus(
        etsyReceipt({
          refunds: [{ amount: { amount: 2000, divisor: 100, currency_code: "USD" }, created_timestamp: 1700000100 }],
        })
      )
    ).toBe("fulfilled");
  });

  it("handles zero-divisor money without NaN", () => {
    const r = etsyReceipt({
      grandtotal: { amount: 10000, divisor: 0, currency_code: "USD" },
      refunds: [{ amount: { amount: 10000, divisor: 0, currency_code: "USD" }, created_timestamp: 1 }],
    });
    // grandTotal parses to 0 → refunded check requires grandTotal > 0
    expect(mapEtsyStatus(r)).toBe("fulfilled");
  });
});

describe("mapWooStatus", () => {
  it.each([
    ["completed", "fulfilled"],
    ["processing", "fulfilled"],
    ["on-hold", "pending"],
    ["pending", "pending"],
    ["refunded", "refunded"],
    ["cancelled", "cancelled"],
    ["failed", "cancelled"],
  ] as const)("maps %s → %s", (wc, expected) => {
    expect(mapWooStatus(wc)).toBe(expected);
  });

  it("defaults unknown statuses to fulfilled", () => {
    expect(mapWooStatus("some-future-status")).toBe("fulfilled");
  });
});
