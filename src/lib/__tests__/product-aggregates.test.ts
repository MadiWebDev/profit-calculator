/**
 * Product aggregates tests — pure module.
 * Every number below is hand-computed from the spec, not derived from
 * the implementation. Amounts passed in are already in ONE currency
 * (the caller converts per order first); these tests assert the
 * summation, grouping, and guard behaviour only.
 */
import { describe, it, expect } from "vitest";
import {
  avgPriceInCurrency,
  computeProductAggregates,
  lookupProductAggregate,
  emptyProductAggregate,
  planBulkApplyPercent,
  productAggregateKey,
  type AggregateOrder,
  type AggregateOrderLineItem,
} from "@/lib/product-aggregates";

function line(partial: Partial<AggregateOrderLineItem>): AggregateOrderLineItem {
  return { name: "Widget", quantity: 1, price: 0, cogs: 0, ...partial };
}

function order(
  partial: Partial<AggregateOrder> & { lineItems: AggregateOrderLineItem[] },
): AggregateOrder {
  return { status: "fulfilled", ...partial };
}

describe("productAggregateKey", () => {
  it("prefers productId, then sku, then name", () => {
    expect(productAggregateKey({ productId: "p1", sku: "S1", name: "A" })).toBe("p1");
    expect(productAggregateKey({ sku: "S1", name: "A" })).toBe("S1");
    expect(productAggregateKey({ name: "A" })).toBe("A");
    expect(productAggregateKey({})).toBe("unknown");
  });
});

describe("computeProductAggregates", () => {
  it("sums revenue/COGS per product and derives profit, margin, avg price", () => {
    // A: order 1 → 2×100 rev, 2×40 cogs; order 2 → 1×100 rev, 1×40 cogs.
    // Totals: revenue 300, cogs 120, profit 180, margin 60%, orders 2,
    // avg price 300/2 = 150.
    const orders = [
      order({
        lineItems: [
          line({ productId: "shop-1", name: "A", quantity: 2, price: 100, cogs: 40, totalRevenue: 200, totalCogs: 80 }),
        ],
      }),
      order({
        lineItems: [
          line({ productId: "shop-1", name: "A", quantity: 1, price: 100, cogs: 40, totalRevenue: 100, totalCogs: 40 }),
        ],
      }),
    ];
    const agg = computeProductAggregates(orders).get("shop-1");
    expect(agg).toMatchObject({
      totalRevenue: 300,
      totalCogs: 120,
      totalProfit: 180,
      totalOrders: 2,
      avgProfitMargin: 60,
      avgPrice: 150,
    });
  });

  it("groups by sku when there is no productId, and by name as a last resort", () => {
    const orders = [
      order({ lineItems: [line({ sku: "SKU-9", name: "Gadget", quantity: 1, price: 50, cogs: 10, totalRevenue: 50, totalCogs: 10 })] }),
      order({ lineItems: [line({ name: "NoSku NoId", quantity: 3, price: 20, cogs: 5, totalRevenue: 60, totalCogs: 15 })] }),
    ];
    const byKey = computeProductAggregates(orders);
    expect(byKey.get("SKU-9")).toMatchObject({ totalRevenue: 50, totalOrders: 1, name: "Gadget" });
    expect(byKey.get("NoSku NoId")).toMatchObject({ totalRevenue: 60, totalOrders: 1 });
  });

  it("excludes cancelled orders but keeps refunded ones", () => {
    const orders = [
      order({ status: "cancelled", lineItems: [line({ productId: "p1", totalRevenue: 999, totalCogs: 1 })] }),
      order({ status: "refunded", lineItems: [line({ productId: "p1", totalRevenue: 100, totalCogs: 30 })] }),
    ];
    const agg = computeProductAggregates(orders).get("p1");
    expect(agg).toMatchObject({ totalRevenue: 100, totalCogs: 30, totalOrders: 1 });
  });

  it("counts an order with two lines of the same product as ONE order", () => {
    const orders = [
      order({
        lineItems: [
          line({ productId: "p1", quantity: 1, totalRevenue: 100, totalCogs: 20 }),
          line({ productId: "p1", quantity: 2, totalRevenue: 200, totalCogs: 40 }),
        ],
      }),
    ];
    const agg = computeProductAggregates(orders).get("p1");
    expect(agg).toMatchObject({ totalRevenue: 300, totalCogs: 60, totalOrders: 1, avgPrice: 300 });
  });

  it("falls back to price × quantity / cogs × quantity when totals are missing", () => {
    const orders = [
      order({ lineItems: [line({ productId: "p1", quantity: 3, price: 25, cogs: 8 })] }),
    ];
    const agg = computeProductAggregates(orders).get("p1");
    expect(agg).toMatchObject({ totalRevenue: 75, totalCogs: 24, totalProfit: 51 });
  });

  it("reports 0 margin and 0 avg price when there is no revenue", () => {
    const orders = [
      order({ lineItems: [line({ productId: "p1", quantity: 1, price: 0, cogs: 0, totalRevenue: 0, totalCogs: 0 })] }),
    ];
    const agg = computeProductAggregates(orders).get("p1");
    expect(agg).toMatchObject({ totalRevenue: 0, totalProfit: 0, avgProfitMargin: 0, totalOrders: 1, avgPrice: 0 });
  });

  it("coerces non-finite inputs to 0 instead of poisoning the totals", () => {
    const orders = [
      order({
        lineItems: [
          line({ productId: "p1", quantity: 1, price: Number.NaN, cogs: Number.NaN, totalRevenue: Number.NaN, totalCogs: Number.NaN }),
          line({ productId: "p1", quantity: 1, price: 10, cogs: 4, totalRevenue: 10, totalCogs: 4 }),
        ],
      }),
    ];
    const agg = computeProductAggregates(orders).get("p1");
    expect(agg).toMatchObject({ totalRevenue: 10, totalCogs: 4, totalProfit: 6, totalOrders: 1 });
  });

  it("returns an empty map for no orders", () => {
    expect(computeProductAggregates([]).size).toBe(0);
    expect(computeProductAggregates(undefined).size).toBe(0);
  });
});

describe("lookupProductAggregate", () => {
  it("tries externalId, then sku, then name — matching the line-item key precedence", () => {
    const byKey = computeProductAggregates([
      order({ lineItems: [line({ productId: "shop-7", sku: "S7", name: "Seven", totalRevenue: 70, totalCogs: 20 })] }),
      order({ lineItems: [line({ sku: "S8", name: "Eight", totalRevenue: 80, totalCogs: 30 })] }),
    ]);
    // Line keyed by productId "shop-7": found via externalId, not via sku.
    expect(lookupProductAggregate(byKey, { externalId: "shop-7", sku: "OTHER", name: "Seven" })?.totalRevenue).toBe(70);
    // Line keyed by sku "S8": found via sku when there is no externalId.
    expect(lookupProductAggregate(byKey, { sku: "S8", name: "Eight" })?.totalRevenue).toBe(80);
    // A product with no orders at all misses on every key.
    expect(lookupProductAggregate(byKey, { externalId: "shop-99", sku: "S99", name: "Nine" })).toBeUndefined();
  });

  it("emptyProductAggregate is all zeros", () => {
    expect(emptyProductAggregate("x", "X")).toMatchObject({
      totalRevenue: 0,
      totalOrders: 0,
      totalCogs: 0,
      totalProfit: 0,
      avgProfitMargin: 0,
      avgPrice: 0,
    });
  });
});

describe("planBulkApplyPercent — the Apply-% guard", () => {
  const rows = [
    { id: "a", name: "Seller", avgPrice: 100 },
    { id: "b", name: "NoOrders", avgPrice: 0 },
    { id: "c", name: "Broken", avgPrice: Number.NaN },
  ];

  it("computes COGS from the real average price for products that have one", () => {
    const plan = planBulkApplyPercent(rows, 40);
    expect(plan.updates).toEqual([{ id: "a", defaultCogs: 40 }]);
  });

  it("NEVER writes defaultCogs: 0 for a zero or non-finite average — it skips instead", () => {
    const plan = planBulkApplyPercent(rows, 40);
    expect(plan.updates.every((u) => u.defaultCogs !== 0)).toBe(true);
    expect(plan.skipped.map((s) => s.id).sort()).toEqual(["b", "c"]);
    expect(plan.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it("skips everything when the percentage is 0, negative, or not a number", () => {
    for (const pct of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const plan = planBulkApplyPercent(rows, pct);
      expect(plan.updates).toEqual([]);
      expect(plan.skipped).toHaveLength(3);
    }
  });

  it("skips a product whose computed COGS would round to 0", () => {
    const plan = planBulkApplyPercent([{ id: "t", name: "Tiny", avgPrice: 0.001 }], 10);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
  });

  it("rounds to 2dp", () => {
    const plan = planBulkApplyPercent([{ id: "r", name: "Rounder", avgPrice: 33.33 }], 33);
    expect(plan.updates).toEqual([{ id: "r", defaultCogs: 11 }]);
  });

  it("skips a product whose average price could not be converted into its own currency (null) — never writes the base value as foreign COGS", () => {
    const plan = planBulkApplyPercent(
      [
        { id: "x", name: "NoFx", avgPrice: null },
        { id: "a", name: "Seller", avgPrice: 100 },
      ],
      40,
    );
    expect(plan.updates).toEqual([{ id: "a", defaultCogs: 40 }]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].id).toBe("x");
    expect(plan.skipped[0].reason).toMatch(/could not be converted/);
  });
});

describe("avgPriceInCurrency — the Apply-% write must be in product currency", () => {
  const rates = { USD: 1, PKR: 276.62 };

  it("same currency passes the value through unchanged, even 0", () => {
    expect(avgPriceInCurrency(31114.11, "PKR", "PKR", rates)).toBe(31114.11);
    expect(avgPriceInCurrency(0, "PKR", "PKR", null)).toBe(0);
  });

  it("converts base PKR into product USD (the smoke repro: 31,114.11 PKR ≈ $112.48, not $31,114)", () => {
    expect(avgPriceInCurrency(31114.11, "PKR", "USD", rates)).toBe(112.48);
  });

  it("converts base USD into product PKR", () => {
    expect(avgPriceInCurrency(100, "USD", "PKR", rates)).toBe(27662);
  });

  it("returns null when rates are missing or empty and currencies differ — never fails open 1:1", () => {
    expect(avgPriceInCurrency(31114.11, "PKR", "USD", null)).toBeNull();
    expect(avgPriceInCurrency(31114.11, "PKR", "USD", {})).toBeNull();
  });

  it("returns null for an unknown currency code instead of a wrong number", () => {
    expect(avgPriceInCurrency(100, "USD", "XXX", rates)).toBeNull();
  });

  it("treats a missing product currency as the base currency", () => {
    expect(avgPriceInCurrency(100, "USD", null, rates)).toBe(100);
    expect(avgPriceInCurrency(100, "USD", undefined, rates)).toBe(100);
  });
});
