import { describe, it, expect } from "vitest";
import { discountProfitability, returnsAnalytics, marketBasket, pricingOptimizer, inventoryAnalysis, cashFlowForecast, benchmarkCompare, type F1Order } from "@/lib/f1-engines";

const orders: F1Order[] = [
  { id: "1", revenue: 100, netProfit: 30, cogs: 50, discountCode: "SAVE10", discountAmount: 10, productIds: ["A", "B"], productId: "A" },
  { id: "2", revenue: 100, netProfit: -5, cogs: 80, discountCode: "SAVE10", discountAmount: 20, productIds: ["A", "B"], productId: "A" },
  { id: "3", revenue: 50, netProfit: 20, cogs: 20, refundAmount: 50, status: "refunded", productIds: ["C"], productId: "C", returnReason: "damaged", courier: "DHL", country: "PK" },
];

describe("F1 engines", () => {
  it("discount profitability flags a losing code", () => {
    const { codes } = discountProfitability(orders);
    const save10 = codes.find((c) => c.code === "SAVE10")!;
    expect(save10.profit).toBe(25);
    expect(save10.losesMoney).toBe(false);
    const losing = discountProfitability([{ id: "x", revenue: 10, netProfit: -3, cogs: 10, discountCode: "BAD", discountAmount: 5 }]);
    expect(losing.codes[0].losesMoney).toBe(true);
    expect(losing.codes[0].alert).toContain("loses money");
  });
  it("returns analytics computes rate, cost and problem products", () => {
    const r = returnsAnalytics(orders);
    expect(r.returnedOrders).toBe(1);
    expect(r.costOfReturns).toBe(50);
    expect(r.byReason[0]).toEqual({ reason: "damaged", count: 1 });
  });
  it("market basket finds A+B bought together twice", () => {
    const basket = marketBasket(orders);
    expect(basket[0].a).toBe("A");
    expect(basket[0].b).toBe("B");
    expect(basket[0].count).toBe(2);
  });
  it("pricing optimizer never applies a price, only suggests", () => {
    const p = pricingOptimizer({ productId: "A", currentPrice: 100, unitCost: 85, adCostPerOrder: 10, orders: 100, conversionRate: 0.03 });
    expect(p.currentMargin).toBe(5);
    expect(p.suggestedPrice).toBe(110);
    expect(p.simulatedProfitDelta).toBeGreaterThan(0);
  });
  it("inventory flags reorder and dead stock", () => {
    const inv = inventoryAnalysis([
      { productId: "A", stock: 5, soldLast30d: 30, leadTimeDays: 10, unitCost: 10 },
      { productId: "B", stock: 20, soldLast30d: 0, leadTimeDays: 7, unitCost: 15 },
    ]);
    expect(inv[0].needsReorder).toBe(true);
    expect(inv[1].deadStock).toBe(true);
    expect(inv[1].deadStockCapital).toBe(300);
  });
  it("cash-flow forecast balances and computes runway", () => {
    const cf = cashFlowForecast({ expectedPayouts: [{ date: "2026-11-01", amount: 1000 }], codSettlements: [], adBills: [{ date: "2026-11-01", amount: 200 }], expenses: [], currentBalance: 500, dailyBurn: 100 });
    expect(cf.byDate[0].balance).toBe(1300);
    expect(cf.daysOfRunway).toBe(5);
  });
  it("benchmarks withhold small cohorts", () => {
    expect(benchmarkCompare({ margin: 30, refundRate: 5, rtoRate: 2 }, [{ margin: 25, refundRate: 4, rtoRate: 3 }]).available).toBe(false);
    const cohort = Array.from({ length: 10 }, () => ({ margin: 25, refundRate: 4, rtoRate: 3 }));
    const ok = benchmarkCompare({ margin: 30, refundRate: 5, rtoRate: 2 }, cohort);
    expect(ok.available).toBe(true);
  });
});
