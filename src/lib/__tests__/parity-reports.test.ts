/**
 * Parity report engine tests — Phase 5.
 * Proves: page total === sum of its rows, for every grouping, and
 * that cancelled orders never enter a total. Also proves the
 * monthly-expense allocation and the leak detector's amounts come
 * from the data, not from constants.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeOrders,
  groupOrders,
  bucketOrders,
  allocateMonthlyExpenses,
  detectLeaks,
  type ReportOrderInput,
} from "@/lib/parity-reports";

function order(partial: Partial<ReportOrderInput> & { orderDate: string }): ReportOrderInput {
  return {
    grossRevenue: 100, discounts: 0, shippingRevenue: 0, shippingCost: 5,
    totalCogs: 40, transactionFees: 3, taxes: 0, refundAmount: 0,
    chargebackAmount: 0, adSpendAllocated: 10, otherCosts: 0,
    status: "fulfilled",
    ...partial,
  } as ReportOrderInput;
}

const orders: ReportOrderInput[] = [
  order({ orderDate: "2026-10-01T10:00:00Z", shippingCountry: "Pakistan", shippingCity: "Karachi", utmCampaign: "summer", grossRevenue: 100 }),
  order({ orderDate: "2026-10-01T14:00:00Z", shippingCountry: "Pakistan", shippingCity: "Lahore", utmCampaign: "summer", grossRevenue: 200, totalCogs: 50 }),
  order({ orderDate: "2026-10-02T09:00:00Z", shippingCountry: "USA", utmCampaign: "winter", grossRevenue: 50, refundAmount: 10 }),
  // Cancelled: must never count anywhere.
  order({ orderDate: "2026-10-02T11:00:00Z", shippingCountry: "USA", status: "cancelled", grossRevenue: 9999 }),
];

describe("summarizeOrders", () => {
  it("excludes cancelled orders and applies the core formula", () => {
    const t = summarizeOrders(orders);
    expect(t.orderCount).toBe(3);
    // Revenue: (100 + 200 + 50) − refunds 10 = 340.
    expect(t.revenue).toBe(340);
    // Net profit: 340 − cogs(40+50+40) − shipping(15) − fees(9) − ad(30) = 156.
    expect(t.netProfit).toBe(156);
    expect(t.netMargin).toBeCloseTo((156 / 340) * 100, 2);
    expect(t.aov).toBeCloseTo(340 / 3, 2);
  });

  it("page total equals the sum of its rows, for every grouping", () => {
    const totals = summarizeOrders(orders);
    for (const rows of [
      groupOrders(orders, (o) => o.shippingCountry ?? "Unknown"),
      groupOrders(orders, (o) => o.utmCampaign ?? "Unattributed"),
      bucketOrders(orders, "daily"),
      bucketOrders(orders, "monthly"),
    ]) {
      const sum = (k: "revenue" | "netProfit" | "cogs" | "adSpend" | "orderCount") =>
        Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;
      expect(sum("revenue")).toBe(totals.revenue);
      expect(sum("netProfit")).toBe(totals.netProfit);
      expect(sum("cogs")).toBe(totals.cogs);
      expect(sum("adSpend")).toBe(totals.adSpend);
      expect(sum("orderCount")).toBe(totals.orderCount);
    }
  });
});

describe("allocateMonthlyExpenses", () => {
  it("allocates a full-month expense proportionally into a partial period", () => {
    // October has 31 days; the period covers Oct 1–15 (15 days).
    const allocated = allocateMonthlyExpenses(
      [{ amount: 310, currency: "USD", startDate: "2026-10-01", endDate: "2026-10-31", allocation: "per_day" }],
      new Date("2026-10-01"), new Date("2026-10-15"),
    );
    expect(allocated).toBe(150);
  });

  it("ignores expenses that do not overlap the period", () => {
    const allocated = allocateMonthlyExpenses(
      [{ amount: 100, currency: "USD", startDate: "2026-09-01", endDate: "2026-09-30", allocation: "per_day" }],
      new Date("2026-10-01"), new Date("2026-10-31"),
    );
    expect(allocated).toBe(0);
  });
});

describe("detectLeaks", () => {
  it("flags a loss-making campaign with its real loss amount", () => {
    const leaks = detectLeaks({
      orders: [
        order({ orderDate: "2026-10-01T10:00:00Z", utmCampaign: "burner", grossRevenue: 10, adSpendAllocated: 100 }),
      ],
      missingCogsProducts: 0, stuckShipments: 0, highRiskUnreviewed: 0,
    });
    const campaign = leaks.find((l) => l.id === "campaign-burner");
    expect(campaign).toBeDefined();
    // Net: 10 − 40 cogs − 5 shipping − 3 fees − 100 ad = −138.
    expect(campaign!.amount).toBe(138);
    expect(campaign!.actionHref).toBe("/dashboard/ad-spend");
  });

  it("flags missing COGS, stuck shipments, and unreviewed risk", () => {
    const leaks = detectLeaks({
      orders: [], missingCogsProducts: 3, stuckShipments: 2, highRiskUnreviewed: 1,
    });
    expect(leaks.map((l) => l.id)).toEqual(
      expect.arrayContaining(["missing-cogs", "stuck-shipments", "high-risk"]),
    );
  });
});
