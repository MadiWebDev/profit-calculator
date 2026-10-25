import { describe, it, expect } from "vitest";
import {
  repullWindow,
  convertAdSpend,
  attributeSpendToCampaigns,
  detectSpendAlerts,
  type SpendRow,
  type AttributableOrder,
} from "@/lib/meta-attribution";

const rates = { USD: 1, EUR: 0.92, PKR: 278.5 };

describe("repullWindow", () => {
  it("covers exactly `days` days inclusive, on UTC boundaries", () => {
    const { start, end } = repullWindow(new Date("2026-10-25T15:30:00+05:00"), 3);
    expect(start.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-25T23:59:59.999Z");
  });

  it("defaults to 3 days", () => {
    const { start, end } = repullWindow(new Date("2026-01-10T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-01-08T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-10T23:59:59.999Z");
  });

  it("handles month boundaries", () => {
    const { start } = repullWindow(new Date("2026-03-01T12:00:00Z"), 3);
    expect(start.toISOString()).toBe("2026-02-27T00:00:00.000Z");
  });

  it("rejects invalid day counts", () => {
    expect(() => repullWindow(new Date(), 0)).toThrow();
    expect(() => repullWindow(new Date(), 1.5)).toThrow();
  });
});

describe("convertAdSpend", () => {
  it("same-currency conversion is exact", () => {
    expect(convertAdSpend(123.45, "USD", "USD", rates)).toBe(123.45);
    expect(convertAdSpend(100, "eur", "EUR", rates)).toBe(100);
  });

  it("converts via the shared profit-engine rates", () => {
    // 92 EUR -> 100 USD (92 / 0.92)
    expect(convertAdSpend(92, "EUR", "USD", rates)).toBe(100);
  });

  it("throws on unknown currency", () => {
    expect(() => convertAdSpend(10, "XXX", "USD", rates)).toThrow(/XXX/);
  });
});

describe("attributeSpendToCampaigns", () => {
  const spend: SpendRow[] = [
    { campaignId: "Summer_Sale", spend: 100, currency: "USD" },
    { campaignId: "Winter", spend: 50, currency: "USD" },
  ];
  const orders: AttributableOrder[] = [
    { orderId: "o1", utmCampaign: "summer_sale", utmSource: "facebook", revenue: 400, cogs: 150, fees: 20 },
    { orderId: "o2", utmCampaign: "Summer_Sale", utmSource: "Instagram", revenue: 200, cogs: 80, fees: 10 },
    { orderId: "o3", utmCampaign: "Summer_Sale", utmSource: "google", revenue: 999, cogs: 0, fees: 0 },
    { orderId: "o4", utmCampaign: "Winter", utmSource: "meta", revenue: 120, cogs: 60, fees: 5 },
    { orderId: "o5", revenue: 500, cogs: 100, fees: 10 },
  ];

  it("attributes only on Meta source + case-insensitive campaign match", () => {
    const { campaigns } = attributeSpendToCampaigns(spend, orders);
    const summer = campaigns.find((c) => c.campaignId === "Summer_Sale")!;
    expect(summer.attributedOrders).toBe(2);
    // google order o3 (999 revenue) and sourceless o5 must NOT count
    expect(summer.attributedRevenue).toBe(600);
    const winter = campaigns.find((c) => c.campaignId === "Winter")!;
    expect(winter.attributedOrders).toBe(1);
    expect(winter.attributedRevenue).toBe(120);
  });

  it("ignores non-Meta sources entirely", () => {
    const { campaigns } = attributeSpendToCampaigns(
      [{ campaignId: "X", spend: 10, currency: "USD" }],
      [{ orderId: "g", utmCampaign: "X", utmSource: "tiktok", revenue: 1000, cogs: 0, fees: 0 }]
    );
    expect(campaigns[0].attributedOrders).toBe(0);
    expect(campaigns[0].attributedRevenue).toBe(0);
  });

  it("computes profit, ROAS and break-even ROAS", () => {
    const { campaigns } = attributeSpendToCampaigns(spend, orders);
    const summer = campaigns.find((c) => c.campaignId === "Summer_Sale")!;
    // profit = 600 - 230 - 30 - 100 = 240; roas = 600/100 = 6
    expect(summer.profit).toBe(240);
    expect(summer.roas).toBe(6);
    // break-even = (100 + 230 + 30) / 100 = 3.6
    expect(summer.breakEvenRoas).toBe(3.6);
  });

  it("reports unattributed spend separately, never assigning it elsewhere", () => {
    const { campaigns, unattributedSpend, unattributedCampaignIds } =
      attributeSpendToCampaigns(
        [
          { campaignId: "Matched", spend: 40, currency: "USD" },
          { campaignId: "Lonely", spend: 70, currency: "USD" },
        ],
        [{ orderId: "o", utmCampaign: "Matched", utmSource: "meta", revenue: 200, cogs: 50, fees: 5 }]
      );
    expect(unattributedSpend).toBe(70);
    expect(unattributedCampaignIds).toEqual(["Lonely"]);
    expect(campaigns.find((c) => c.campaignId === "Matched")!.spend).toBe(40);
  });

  it("never produces NaN on zero spend", () => {
    const { campaigns } = attributeSpendToCampaigns(
      [{ campaignId: "Free", spend: 0, currency: "USD" }],
      [{ orderId: "o", utmCampaign: "Free", utmSource: "meta", revenue: 300, cogs: 100, fees: 10 }]
    );
    const c = campaigns[0];
    expect(c.roas).toBe(0);
    expect(c.breakEvenRoas).toBe(0);
    expect(c.profit).toBe(190);
    expect(Number.isNaN(c.roas)).toBe(false);
    expect(Number.isNaN(c.breakEvenRoas)).toBe(false);
  });
});

describe("detectSpendAlerts", () => {
  const campaign = (over: Record<string, number | string>) => ({
    campaignId: "C1",
    spend: 0,
    attributedRevenue: 0,
    attributedOrders: 0,
    attributedCogs: 0,
    attributedFees: 0,
    profit: 0,
    roas: 0,
    breakEvenRoas: 0,
    ...over,
  });

  it("alerts on spend up + profit down", () => {
    const alerts = detectSpendAlerts(
      [campaign({ campaignId: "C1", spend: 200, profit: 10, roas: 3, breakEvenRoas: 2 })],
      [{ campaignId: "C1", spend: 100, profit: 50, attributedOrders: 2 }]
    );
    expect(alerts.map((a) => a.type)).toContain("spend_up_profit_down");
  });

  it("alerts on campaign below break-even ROAS (no prev period needed)", () => {
    const alerts = detectSpendAlerts(
      [campaign({ campaignId: "C1", spend: 100, profit: -20, roas: 1.5, breakEvenRoas: 2.0 })],
      []
    );
    expect(alerts.map((a) => a.type)).toEqual(["below_break_even"]);
  });

  it("does not flag break-even when spend is 0", () => {
    const alerts = detectSpendAlerts([campaign({ spend: 0, roas: 0, breakEvenRoas: 0 })], []);
    expect(alerts).toEqual([]);
  });

  it("alerts on spend spike over 50% and over $50 absolute", () => {
    const alerts = detectSpendAlerts(
      [campaign({ campaignId: "C1", spend: 200, profit: 100, roas: 3, breakEvenRoas: 2 })],
      [{ campaignId: "C1", spend: 100, profit: 80, attributedOrders: 3 }]
    );
    expect(alerts.map((a) => a.type)).toContain("spend_spike");
  });

  it("does not flag a small absolute rise as a spike", () => {
    const alerts = detectSpendAlerts(
      [campaign({ campaignId: "C1", spend: 12, profit: 5, roas: 3, breakEvenRoas: 2 })],
      [{ campaignId: "C1", spend: 5, profit: 4, attributedOrders: 1 }]
    );
    expect(alerts.map((a) => a.type)).not.toContain("spend_spike");
  });

  it("alerts on tracking break: spend with zero attributed orders after attributed prev", () => {
    const alerts = detectSpendAlerts(
      [campaign({ campaignId: "C1", spend: 80, profit: -80, attributedOrders: 0, roas: 0, breakEvenRoas: 1 })],
      [{ campaignId: "C1", spend: 60, profit: 20, attributedOrders: 4 }]
    );
    const tracking = alerts.find((a) => a.type === "tracking_break")!;
    expect(tracking.severity).toBe("critical");
    expect(tracking.message).toMatch(/UTM/i);
  });

  it("matches previous period case-insensitively and skips prev alerts without a baseline", () => {
    const alerts = detectSpendAlerts(
      [campaign({ campaignId: "SUMMER", spend: 200, profit: 10, roas: 3, breakEvenRoas: 2 })],
      [{ campaignId: "summer", spend: 100, profit: 50, attributedOrders: 2 }]
    );
    expect(alerts.map((a) => a.type)).toContain("spend_up_profit_down");
    const noBaseline = detectSpendAlerts(
      [campaign({ campaignId: "NEW", spend: 200, profit: 10, roas: 3, breakEvenRoas: 2 })],
      []
    );
    expect(noBaseline.map((a) => a.type)).not.toContain("spend_up_profit_down");
    expect(noBaseline.map((a) => a.type)).not.toContain("spend_spike");
  });
});
