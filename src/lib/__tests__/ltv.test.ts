import { describe, it, expect } from "vitest";
import { aggregateLtvOrders } from "@/lib/ltv";

// Rates table in the shape getFxRates returns (USD-based here):
// 1 USD = 276.62 PKR, so PKR 27,662 converts to exactly $100.
const RATES = { USD: 1, PKR: 276.62 };
const NOW = new Date("2026-11-13T12:00:00.000Z");

describe("aggregateLtvOrders — per-order conversion before summing", () => {
  it("converts mixed-currency orders into the base before summing (no 1:1 sums)", () => {
    const { customers } = aggregateLtvOrders(
      [
        { customerEmail: "a@x.com", orderDate: new Date("2026-10-05"), currency: "PKR", netRevenue: 27662, netProfit: 13831, totalCogs: 10000, adSpendAllocated: 2766.2 },
        { customerEmail: "a@x.com", orderDate: new Date("2026-10-20"), currency: "USD", netRevenue: 100, netProfit: 50, totalCogs: 40, adSpendAllocated: 10 },
      ],
      "USD",
      RATES,
      NOW,
    );
    expect(customers).toHaveLength(1);
    const c = customers[0];
    // PKR 27,662 = $100 revenue; PKR 13,831 = $50 profit — NOT 27,762.
    expect(c.totalRevenue).toBeCloseTo(200, 2);
    expect(c.totalProfit).toBeCloseTo(100, 2);
    expect(c.totalCogs).toBeCloseTo(10000 / 276.62 + 40, 2);
    expect(c.totalAdSpend).toBeCloseTo(10 + 10, 2);
    expect(c.orderCount).toBe(2);
    expect(c.avgOrderValue).toBeCloseTo(100, 2);
    expect(c.firstOrderDate.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(c.lastOrderDate.toISOString().slice(0, 10)).toBe("2026-10-20");
  });

  it("passes orders through unconverted when rates are unavailable", () => {
    const { customers } = aggregateLtvOrders(
      [{ customerEmail: "a@x.com", orderDate: new Date("2026-10-05"), currency: "PKR", netRevenue: 1000, netProfit: 500 }],
      "USD",
      null,
      NOW,
    );
    expect(customers[0].totalRevenue).toBe(1000);
    expect(customers[0].totalProfit).toBe(500);
  });

  it("groups cohorts by first-order month and builds the 12-month trend with distinct customers", () => {
    const { customers, trend } = aggregateLtvOrders(
      [
        { customerEmail: "a@x.com", orderDate: new Date("2026-10-05"), currency: "USD", netRevenue: 100, netProfit: 50 },
        { customerEmail: "b@x.com", orderDate: new Date("2026-10-06"), currency: "USD", netRevenue: 200, netProfit: 80 },
        { customerEmail: "a@x.com", orderDate: new Date("2026-11-02"), currency: "USD", netRevenue: 50, netProfit: 20 },
        // Older than the 12-month window: in cohorts, out of the trend.
        { customerEmail: "c@x.com", orderDate: new Date("2025-06-15"), currency: "USD", netRevenue: 999, netProfit: 999 },
      ],
      "USD",
      RATES,
      NOW,
    );
    expect(customers).toHaveLength(3);
    expect(trend.map((t) => t._id)).toEqual(["2026-10", "2026-11"]);
    const oct = trend.find((t) => t._id === "2026-10")!;
    expect(oct.totalRevenue).toBe(300);
    expect(oct.activeCustomers).toBe(2);
    expect(oct.totalOrders).toBe(2);
    const nov = trend.find((t) => t._id === "2026-11")!;
    expect(nov.totalRevenue).toBe(50);
    expect(nov.activeCustomers).toBe(1);
  });

  it("buckets order frequency like $bucket [1,2,3,4,6,11] + many", () => {
    const orders = [
      { customerEmail: "one@x.com", orderDate: new Date("2026-10-01"), currency: "USD", netRevenue: 10, netProfit: 5 },
      { customerEmail: "two@x.com", orderDate: new Date("2026-10-01"), currency: "USD", netRevenue: 10, netProfit: 5 },
      { customerEmail: "two@x.com", orderDate: new Date("2026-10-02"), currency: "USD", netRevenue: 10, netProfit: 5 },
      ...Array.from({ length: 12 }, (_, i) => ({
        customerEmail: "many@x.com",
        orderDate: new Date(`2026-10-${String((i % 28) + 1).padStart(2, "0")}`),
        currency: "USD",
        netRevenue: 10,
        netProfit: 5,
      })),
    ];
    const { frequency } = aggregateLtvOrders(orders, "USD", RATES, NOW);
    const byId = new Map(frequency.map((b) => [b._id, b.customers]));
    expect(byId.get(1)).toBe(1);
    expect(byId.get(2)).toBe(1);
    expect(byId.get("many")).toBe(1);
  });

  it("skips orders with no email or an unparseable date, and guards missing money", () => {
    const { customers } = aggregateLtvOrders(
      [
        { customerEmail: "", orderDate: new Date("2026-10-01"), currency: "USD", netRevenue: 100, netProfit: 50 },
        { customerEmail: "bad@x.com", orderDate: "not-a-date", currency: "USD", netRevenue: 100, netProfit: 50 },
        { customerEmail: "ok@x.com", orderDate: new Date("2026-10-01"), currency: "USD" },
      ],
      "USD",
      RATES,
      NOW,
    );
    expect(customers).toHaveLength(1);
    expect(customers[0]._id).toBe("ok@x.com");
    expect(customers[0].totalRevenue).toBe(0);
    expect(customers[0].avgOrderValue).toBe(0);
  });
});
