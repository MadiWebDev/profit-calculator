import { describe, expect, it } from "vitest";
import {
  evaluateAlerts,
  metricValue,
  type AlertOrderInput,
  type AlertRuleInput,
  type AlertShipmentInput,
} from "@/lib/alerts";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function order(overrides: Partial<AlertOrderInput> = {}): AlertOrderInput {
  return {
    orderDate: new Date(NOW.getTime() - 5 * DAY),
    grossRevenue: 1000,
    netProfit: 200,
    refundAmount: 0,
    rtoLoss: 0,
    status: "delivered",
    ...overrides,
  };
}

function shipment(overrides: Partial<AlertShipmentInput> = {}): AlertShipmentInput {
  return { status: "delivered", bookedAt: new Date(NOW.getTime() - DAY), ...overrides };
}

function rule(overrides: Partial<AlertRuleInput> = {}): AlertRuleInput {
  return {
    id: "r1",
    metric: "profit_margin",
    operator: "below",
    threshold: 20,
    windowDays: 30,
    ...overrides,
  };
}

describe("metricValue", () => {
  it("computes profit margin as net profit / revenue * 100", () => {
    // (200 + 50) / (1000 + 500) * 100 = 16.666... -> 16.67
    const orders = [
      order({ grossRevenue: 1000, netProfit: 200 }),
      order({ grossRevenue: 500, netProfit: 50 }),
    ];
    expect(metricValue("profit_margin", orders, [], 30, NOW)).toBe(16.67);
  });

  it("computes refund rate from refundAmount and refunded status", () => {
    // 2 of 4 refunded: one by amount, one by status with zero amount.
    const orders = [
      order({ refundAmount: 100 }),
      order({ status: "refunded" }),
      order(),
      order(),
    ];
    expect(metricValue("refund_rate", orders, [], 30, NOW)).toBe(50);
  });

  it("computes RTO rate from shipments when provided", () => {
    const shipments = [
      shipment({ status: "returned_rto" }),
      shipment(),
      shipment(),
      shipment(),
    ];
    expect(metricValue("rto_rate", [], shipments, 30, NOW)).toBe(25);
  });

  it("falls back to orders for RTO rate when no shipments are provided", () => {
    const orders = [order({ rtoLoss: 150 }), order(), order(), order()];
    expect(metricValue("rto_rate", orders, [], 30, NOW)).toBe(25);
  });

  it("computes average order profit as mean net profit", () => {
    const orders = [
      order({ netProfit: 100 }),
      order({ netProfit: 200 }),
      order({ netProfit: 300 }),
    ];
    expect(metricValue("avg_order_profit", orders, [], 30, NOW)).toBe(200);
  });

  it("excludes orders outside the window", () => {
    const orders = [
      order({ grossRevenue: 1000, netProfit: 200 }),
      // 54 days old: outside the 30-day window, must not count.
      order({
        orderDate: new Date(NOW.getTime() - 54 * DAY),
        grossRevenue: 10000,
        netProfit: 10000,
      }),
    ];
    expect(metricValue("profit_margin", orders, [], 30, NOW)).toBe(20);
  });

  it("excludes cancelled orders from every metric", () => {
    const orders = [
      order({ grossRevenue: 1000, netProfit: 200 }),
      order({
        status: "cancelled",
        grossRevenue: 99999,
        netProfit: 99999,
        refundAmount: 99999,
        rtoLoss: 99999,
      }),
    ];
    expect(metricValue("profit_margin", orders, [], 30, NOW)).toBe(20);
    expect(metricValue("refund_rate", orders, [], 30, NOW)).toBe(0);
    expect(metricValue("rto_rate", orders, [], 30, NOW)).toBe(0);
    expect(metricValue("avg_order_profit", orders, [], 30, NOW)).toBe(200);
  });

  it("prefers bookedAt over createdAt for shipment dates", () => {
    const shipments = [
      // Booked 60 days ago but created recently: bookedAt wins, excluded.
      shipment({
        status: "delivered",
        bookedAt: new Date(NOW.getTime() - 60 * DAY),
        createdAt: new Date(NOW.getTime() - DAY),
      }),
      shipment({ status: "returned_rto" }),
      shipment({ createdAt: new Date(NOW.getTime() - DAY), bookedAt: undefined }),
    ];
    // In window: 2 shipments, 1 RTO -> 50%.
    expect(metricValue("rto_rate", [], shipments, 30, NOW)).toBe(50);
  });

  it("includes undated shipments in the RTO rate", () => {
    const shipments = [
      shipment({ status: "returned_rto", bookedAt: undefined, createdAt: undefined }),
      shipment({ bookedAt: undefined, createdAt: undefined }),
    ];
    expect(metricValue("rto_rate", [], shipments, 30, NOW)).toBe(50);
  });

  it("returns 0 with no in-window shipments even when shipments exist", () => {
    const shipments = [
      shipment({ bookedAt: new Date(NOW.getTime() - 60 * DAY) }),
    ];
    expect(metricValue("rto_rate", [], shipments, 30, NOW)).toBe(0);
  });

  it("coerces non-finite inputs to 0", () => {
    const orders = [order({ grossRevenue: NaN, netProfit: Infinity })];
    // Revenue coerces to 0 -> zero-revenue margin -> 0.
    expect(metricValue("profit_margin", orders, [], 30, NOW)).toBe(0);
    const refundOrders = [order({ refundAmount: NaN })];
    expect(metricValue("refund_rate", refundOrders, [], 30, NOW)).toBe(0);
  });
});

describe("evaluateAlerts triggers", () => {
  it("triggers below when value < threshold and above when value > threshold", () => {
    const orders = [order({ grossRevenue: 1000, netProfit: 100 })]; // margin 10%
    const [below] = evaluateAlerts([rule({ operator: "below", threshold: 20 })], orders, [], NOW);
    expect(below.triggered).toBe(true);
    expect(below.value).toBe(10);
    const [above] = evaluateAlerts([rule({ operator: "above", threshold: 5 })], orders, [], NOW);
    expect(above.triggered).toBe(true);
  });

  it("never triggers on equality for either operator", () => {
    const orders = [order({ grossRevenue: 1000, netProfit: 200 })]; // margin 20%
    const [below] = evaluateAlerts([rule({ operator: "below", threshold: 20 })], orders, [], NOW);
    const [above] = evaluateAlerts([rule({ operator: "above", threshold: 20 })], orders, [], NOW);
    expect(below.triggered).toBe(false);
    expect(below.severity).toBeNull();
    expect(above.triggered).toBe(false);
    expect(above.severity).toBeNull();
  });

  it("does not trigger zero-revenue margin even for a below rule", () => {
    const orders = [order({ grossRevenue: 0, netProfit: 0 })];
    const [ev] = evaluateAlerts([rule({ operator: "below", threshold: 20 })], orders, [], NOW);
    expect(ev.value).toBe(0);
    expect(ev.triggered).toBe(false);
  });

  it("does not trigger average order profit with no orders in window", () => {
    const [ev] = evaluateAlerts(
      [rule({ metric: "avg_order_profit", operator: "below", threshold: 100 })],
      [],
      [],
      NOW,
    );
    expect(ev.value).toBe(0);
    expect(ev.triggered).toBe(false);
  });

  it("does not trigger RTO from shipments when none fall in the window", () => {
    const shipments = [shipment({ bookedAt: new Date(NOW.getTime() - 60 * DAY) })];
    const [ev] = evaluateAlerts(
      [rule({ metric: "rto_rate", operator: "below", threshold: 50 })],
      [],
      shipments,
      NOW,
    );
    expect(ev.value).toBe(0);
    expect(ev.triggered).toBe(false);
  });

  it("reports all evaluations untriggered with value 0 on empty input", () => {
    const rules = (["profit_margin", "refund_rate", "rto_rate", "avg_order_profit"] as const).map(
      (metric, i) =>
        rule({ id: `r${i}`, metric, operator: i % 2 === 0 ? "below" : "above", threshold: 20 }),
    );
    const results = evaluateAlerts(rules, [], [], NOW);
    expect(results).toHaveLength(4);
    for (const ev of results) {
      expect(ev.value).toBe(0);
      expect(ev.triggered).toBe(false);
      expect(ev.severity).toBeNull();
    }
  });
});

describe("evaluateAlerts severity", () => {
  it("marks a large below breach critical at exactly half the threshold", () => {
    const orders = [order({ grossRevenue: 1000, netProfit: 100 })]; // margin 10% = 0.5 * 20
    const [ev] = evaluateAlerts([rule({ operator: "below", threshold: 20 })], orders, [], NOW);
    expect(ev.triggered).toBe(true);
    expect(ev.severity).toBe("critical");
  });

  it("marks a small below breach warning", () => {
    const orders = [order({ grossRevenue: 1000, netProfit: 150 })]; // margin 15%
    const [ev] = evaluateAlerts([rule({ operator: "below", threshold: 20 })], orders, [], NOW);
    expect(ev.triggered).toBe(true);
    expect(ev.severity).toBe("warning");
  });

  it("marks a large above breach critical at exactly 1.5x the threshold", () => {
    const orders = [order(), order(), order(), order(), order(), order(), order(), order(), order(), order()];
    const refunded = orders.map((o, i) => (i < 3 ? { ...o, refundAmount: 10 } : o));
    // 3 of 10 refunded = 30% = 1.5 * 20.
    const [ev] = evaluateAlerts(
      [rule({ metric: "refund_rate", operator: "above", threshold: 20 })],
      refunded,
      [],
      NOW,
    );
    expect(ev.triggered).toBe(true);
    expect(ev.severity).toBe("critical");
  });

  it("marks a small above breach warning", () => {
    const orders = [order({ refundAmount: 10 }), order(), order(), order()]; // 25%
    const [ev] = evaluateAlerts(
      [rule({ metric: "refund_rate", operator: "above", threshold: 20 })],
      orders,
      [],
      NOW,
    );
    expect(ev.triggered).toBe(true);
    expect(ev.severity).toBe("warning");
  });

  it("always uses warning severity for thresholds <= 0", () => {
    // Negative margin -5% breaches a below-0 rule, but severity stays warning.
    const orders = [order({ grossRevenue: 1000, netProfit: -50 })];
    const [below] = evaluateAlerts(
      [rule({ operator: "below", threshold: 0 })],
      orders,
      [],
      NOW,
    );
    expect(below.triggered).toBe(true);
    expect(below.severity).toBe("warning");
    // 50% refund rate breaches an above-0 rule; 1.5x band is meaningless at 0.
    const refundOrders = [order({ refundAmount: 10 }), order()];
    const [above] = evaluateAlerts(
      [rule({ metric: "refund_rate", operator: "above", threshold: 0 })],
      refundOrders,
      [],
      NOW,
    );
    expect(above.triggered).toBe(true);
    expect(above.severity).toBe("warning");
  });
});

describe("evaluateAlerts message", () => {
  it("formats a triggered message exactly", () => {
    const orders = [order({ grossRevenue: 1000, netProfit: 125 })]; // margin 12.5%
    const [ev] = evaluateAlerts(
      [rule({ operator: "below", threshold: 20, windowDays: 30 })],
      orders,
      [],
      NOW,
    );
    expect(ev.message).toBe(
      "Profit margin 12.50% is below threshold 20% over the last 30 days",
    );
  });

  it("formats an untriggered message with within", () => {
    const orders = [order({ grossRevenue: 1000, netProfit: 250 })]; // margin 25%
    const [ev] = evaluateAlerts(
      [rule({ operator: "below", threshold: 20, windowDays: 7 })],
      orders,
      [],
      NOW,
    );
    expect(ev.message).toBe(
      "Profit margin 25.00% is within threshold 20% over the last 7 days",
    );
  });

  it("formats average order profit without a percent sign", () => {
    const orders = [order({ netProfit: 80 })];
    const [ev] = evaluateAlerts(
      [rule({ metric: "avg_order_profit", operator: "below", threshold: 100 })],
      orders,
      [],
      NOW,
    );
    expect(ev.message).toBe(
      "Average order profit 80.00 is below threshold 100 over the last 30 days",
    );
  });
});
