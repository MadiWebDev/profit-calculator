/**
 * Product intelligence tests — pure module.
 * Every number below is hand-computed from the spec, not derived from
 * the implementation: allocation shares, break-even prices, mover
 * percentages and trend boundaries are all asserted literally.
 */
import { describe, it, expect } from "vitest";
import {
  rankProducts,
  breakEvenForProduct,
  productMovers,
  type ProductIntelLineItem,
  type ProductIntelOrder,
} from "@/lib/product-intel";

function line(
  partial: Partial<ProductIntelLineItem> & { quantity: number }
): ProductIntelLineItem {
  return {
    price: 0,
    cogs: 0,
    totalRevenue: 0,
    totalCogs: 0,
    ...partial,
  };
}

function order(
  partial: Partial<ProductIntelOrder> & { lineItems: ProductIntelLineItem[] }
): ProductIntelOrder {
  return { status: "fulfilled", ...partial };
}

describe("rankProducts", () => {
  it("allocates non-COGS costs by revenue share and sums to true profit", () => {
    // Order: A 2×100 = 200 revenue, 60 COGS; B 1×50 = 50 revenue, 10 COGS.
    // Non-COGS: shipping 20 + fees 5 + ad 10 + packaging 5 + expense 10 = 50.
    // Shares: A 200/250 = 0.8 → 40; B 0.2 → 10.
    // Fully-loaded: A 200 − 60 − 40 = 100; B 50 − 10 − 10 = 30; sum 130.
    // True profit: grossRevenue 250 − discounts 0 − COGS 70 − non-COGS 50 = 130.
    const orders = [
      order({
        lineItems: [
          line({ productId: "A", name: "Alpha", quantity: 2, price: 100, cogs: 30, totalRevenue: 200, totalCogs: 60 }),
          line({ productId: "B", name: "Beta", quantity: 1, price: 50, cogs: 10, totalRevenue: 50, totalCogs: 10 }),
        ],
        shippingCost: 20,
        transactionFees: 5,
        adSpendAllocated: 10,
        packagingCost: 5,
        expenseAllocation: 10,
      }),
    ];
    const ranked = rankProducts(orders);
    expect(ranked.map((r) => r.key)).toEqual(["A", "B"]);

    const a = ranked[0];
    expect(a.units).toBe(2);
    expect(a.revenue).toBe(200);
    expect(a.cogs).toBe(60);
    expect(a.directProfit).toBe(140);
    expect(a.directMargin).toBe(70);
    expect(a.allocatedCosts).toBe(40);
    expect(a.fullyLoadedProfit).toBe(100);
    expect(a.fullyLoadedMargin).toBe(50);
    expect(a.avgPrice).toBe(100);
    expect(a.avgCogsPerUnit).toBe(30);

    const b = ranked[1];
    expect(b.directProfit).toBe(40);
    expect(b.directMargin).toBe(80);
    expect(b.allocatedCosts).toBe(10);
    expect(b.fullyLoadedProfit).toBe(30);
    expect(b.fullyLoadedMargin).toBe(60);
    expect(b.avgPrice).toBe(50);
    expect(b.avgCogsPerUnit).toBe(10);

    const summed = ranked.reduce((s, r) => s + r.fullyLoadedProfit, 0);
    const trueProfit = 250 - 0 - 70 - 50;
    expect(Math.abs(summed - trueProfit)).toBeLessThanOrEqual(0.01);
  });

  it("splits costs equally when lines carry no revenue", () => {
    const ranked = rankProducts([
      order({
        lineItems: [
          line({ productId: "A", quantity: 1, totalRevenue: 0, totalCogs: 4 }),
          line({ productId: "B", quantity: 1, totalRevenue: 0, totalCogs: 6 }),
        ],
        shippingCost: 10,
      }),
    ]);
    expect(ranked.find((r) => r.key === "A")?.allocatedCosts).toBe(5);
    expect(ranked.find((r) => r.key === "B")?.allocatedCosts).toBe(5);
    expect(ranked.find((r) => r.key === "A")?.fullyLoadedProfit).toBe(-9);
  });

  it("excludes cancelled orders and counts one order once per product", () => {
    const ranked = rankProducts([
      order({
        lineItems: [
          line({ productId: "A", quantity: 1, totalRevenue: 100, totalCogs: 40 }),
          line({ productId: "A", quantity: 2, totalRevenue: 200, totalCogs: 80 }),
        ],
      }),
      order({
        status: "cancelled",
        lineItems: [
          line({ productId: "A", quantity: 99, totalRevenue: 9999, totalCogs: 1 }),
        ],
      }),
    ]);
    const a = ranked.find((r) => r.key === "A");
    expect(a?.units).toBe(3);
    expect(a?.revenue).toBe(300);
    expect(a?.ordersCount).toBe(1);
  });

  it("tracks refundOrderShare and groups by sku then name fallback", () => {
    const ranked = rankProducts([
      order({
        lineItems: [line({ productId: "A", quantity: 1, totalRevenue: 100, totalCogs: 10 })],
      }),
      order({
        refundAmount: 25,
        lineItems: [line({ productId: "A", quantity: 1, totalRevenue: 100, totalCogs: 10 })],
      }),
      order({
        lineItems: [line({ sku: "SKU-1", quantity: 1, totalRevenue: 50, totalCogs: 5 })],
      }),
      order({
        lineItems: [line({ name: "Nameless Widget", quantity: 1, totalRevenue: 30, totalCogs: 3 })],
      }),
    ]);
    const a = ranked.find((r) => r.key === "A");
    expect(a?.ordersCount).toBe(2);
    expect(a?.refundOrderShare).toBe(0.5);
    expect(ranked.find((r) => r.key === "SKU-1")).toBeDefined();
    expect(ranked.find((r) => r.key === "Nameless Widget")).toBeDefined();
  });

  it("coerces non-finite inputs to 0 and returns [] for empty input", () => {
    const ranked = rankProducts([
      order({
        lineItems: [line({ productId: "A", quantity: 1, totalRevenue: 100, totalCogs: 25 })],
        shippingCost: Number.NaN,
        transactionFees: Number.POSITIVE_INFINITY,
      }),
    ]);
    expect(ranked[0].allocatedCosts).toBe(0);
    expect(ranked[0].fullyLoadedProfit).toBe(75);
    expect(rankProducts([])).toEqual([]);
  });
});

describe("breakEvenForProduct", () => {
  const stats = {
    avgCogsPerUnit: 12,
    avgShippingPerUnit: 4,
    avgFeesPerUnit: 2,
    avgAdSpendPerUnit: 1,
    avgOtherPerUnit: 1,
    avgPrice: 40,
  };

  it("computes unit cost, break-even and margin price", () => {
    // Unit cost 12 + 4 + 2 + 1 + 1 = 20; margin price 20 / (1 − 0.25) = 26.67.
    const r = breakEvenForProduct(stats, 0.25);
    expect(r.unitCost).toBe(20);
    expect(r.breakEvenPrice).toBe(20);
    expect(r.priceForMargin).toBe(26.67);
    // Max discount: (40 − 20) / 40 = 0.5.
    expect(r.maxDiscountPct).toBe(0.5);
  });

  it("floors max discount at 0 when price is at or below break-even", () => {
    expect(breakEvenForProduct({ ...stats, avgPrice: 15 }, 0.25).maxDiscountPct).toBe(0);
    expect(breakEvenForProduct({ ...stats, avgPrice: 20 }, 0.25).maxDiscountPct).toBe(0);
    expect(breakEvenForProduct({ ...stats, avgPrice: 0 }, 0.25).maxDiscountPct).toBe(0);
  });

  it("throws for target margins outside [0, 0.95)", () => {
    expect(() => breakEvenForProduct(stats, -0.1)).toThrow(/targetMargin must be in/);
    expect(() => breakEvenForProduct(stats, 0.95)).toThrow(/targetMargin must be in/);
    expect(() => breakEvenForProduct(stats, 1)).toThrow(/targetMargin must be in/);
    expect(() => breakEvenForProduct(stats, Number.NaN)).toThrow(/targetMargin must be in/);
  });

  it("allows zero margin (price equals unit cost)", () => {
    expect(breakEvenForProduct(stats, 0).priceForMargin).toBe(20);
  });
});

describe("productMovers", () => {
  const now = new Date("2026-10-25T00:00:00.000Z");

  function datedOrder(date: string, productKey: string, qty: number): ProductIntelOrder {
    return order({
      orderDate: date,
      lineItems: [line({ productId: productKey, quantity: qty })],
    });
  }

  it("classifies rising, falling, new, dead and stable", () => {
    const movers = productMovers(
      [
        datedOrder("2026-09-01", "rising", 10),
        datedOrder("2026-10-01", "rising", 15), // +50%
        datedOrder("2026-09-01", "falling", 10),
        datedOrder("2026-10-01", "falling", 5), // −50%
        datedOrder("2026-10-01", "new", 3),
        datedOrder("2026-09-01", "dead", 4),
        datedOrder("2026-09-01", "stable", 10),
        datedOrder("2026-10-01", "stable", 11), // +10%
      ],
      30,
      now
    );
    const byKey = new Map(movers.map((m) => [m.key, m]));
    expect(byKey.get("rising")).toMatchObject({ recentUnits: 15, priorUnits: 10, pctChange: 50, trend: "rising" });
    expect(byKey.get("falling")).toMatchObject({ recentUnits: 5, priorUnits: 10, pctChange: -50, trend: "falling" });
    expect(byKey.get("new")).toMatchObject({ recentUnits: 3, priorUnits: 0, pctChange: null, trend: "new" });
    expect(byKey.get("dead")).toMatchObject({ recentUnits: 0, priorUnits: 4, pctChange: -100, trend: "dead" });
    expect(byKey.get("stable")).toMatchObject({ recentUnits: 11, priorUnits: 10, pctChange: 10, trend: "stable" });
  });

  it("treats exactly ±20% as rising/falling", () => {
    const movers = productMovers(
      [
        datedOrder("2026-09-01", "up", 10),
        datedOrder("2026-10-01", "up", 12),
        datedOrder("2026-09-01", "down", 10),
        datedOrder("2026-10-01", "down", 8),
      ],
      30,
      now
    );
    const byKey = new Map(movers.map((m) => [m.key, m]));
    expect(byKey.get("up")).toMatchObject({ pctChange: 20, trend: "rising" });
    expect(byKey.get("down")).toMatchObject({ pctChange: -20, trend: "falling" });
  });

  it("excludes cancelled orders, out-of-window orders and dateless orders", () => {
    const movers = productMovers(
      [
        { ...datedOrder("2026-10-01", "ghost", 5), status: "cancelled" },
        datedOrder("2026-01-01", "ancient", 5),
        order({ lineItems: [line({ productId: "dateless", quantity: 5 })] }),
      ],
      30,
      now
    );
    expect(movers).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(productMovers([], 30, now)).toEqual([]);
  });
});
