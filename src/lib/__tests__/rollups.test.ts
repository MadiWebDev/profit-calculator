/**
 * Phase 8: daily rollup aggregation — pure function + job integration.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { aggregateDayOrders, dayKey } from "@/lib/rollups";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import DailyRollupModel from "@/models/DailyRollup";
import { jobRollupDaily } from "@/lib/jobs";

describe("aggregateDayOrders", () => {
  it("sums live orders and counts cancelled separately", () => {
    const agg = aggregateDayOrders([
      { grossRevenue: 200, netProfit: 90, refundAmount: 0, totalCogs: 80, shippingCost: 12, transactionFees: 5, status: "fulfilled" },
      { grossRevenue: 100, netProfit: 40, refundAmount: 10, totalCogs: 40, shippingCost: 8, transactionFees: 3, status: "pending" },
      { grossRevenue: 500, netProfit: 0, refundAmount: 0, totalCogs: 0, shippingCost: 0, transactionFees: 0, status: "cancelled" },
    ]);
    expect(agg).toEqual({
      grossRevenue: 300, netProfit: 130, refunds: 10, totalCogs: 120,
      shippingCost: 20, transactionFees: 8, orderCount: 2, cancelledOrderCount: 1,
    });
  });
  it("empty input is zeros, and non-finite values are treated as 0", () => {
    expect(aggregateDayOrders([]).orderCount).toBe(0);
    const agg = aggregateDayOrders([
      { grossRevenue: NaN, netProfit: Infinity, refundAmount: 0, totalCogs: 0, shippingCost: 0, transactionFees: 0 },
    ]);
    expect(agg.grossRevenue).toBe(0);
    expect(agg.netProfit).toBe(0);
  });
  it("dayKey is the UTC calendar date", () => {
    expect(dayKey(new Date("2026-10-25T01:00:00.000Z"))).toBe("2026-10-25");
  });
});

describe("jobRollupDaily", () => {
  beforeAll(async () => {
    await setupTestDb();
    await clearDb();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it("upserts one rollup row per team per day", async () => {
    const team = await TeamModel.create({
      name: `Rollup ${Date.now()}`,
      slug: `rollup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ownerId: new mongoose.Types.ObjectId(),
    });
    const store = await StoreModel.create({
      teamId: team._id, name: "Rollup store", platform: "shopify", domain: "rollup.myshopify.com",
    });
    // The job rolls up complete days only (window ends at today's
    // midnight), so seed yesterday's order, not today's.
    const today = new Date();
    today.setDate(today.getDate() - 1);
    today.setHours(12, 0, 0, 0);
    await OrderModel.create({
      teamId: team._id, storeId: store._id,
      externalId: `rollup-${Date.now()}`,
      orderNumber: "#8001", orderDate: today, currency: "USD",
      grossRevenue: 200, discounts: 0, netRevenue: 200, totalCogs: 80,
      shippingCost: 12, shippingRevenue: 0, transactionFees: 5, taxes: 0,
      refundAmount: 0, chargebackAmount: 0, adSpendAllocated: 0,
      netProfit: 103, profitMargin: 51.5,
      lineItems: [], status: "fulfilled",
    });
    const result = await jobRollupDaily();
    expect(result.status).toBe("succeeded");
    const rows = await DailyRollupModel.find({ teamId: team._id }).lean();
    expect(rows.length).toBe(1);
    expect(rows[0].grossRevenue).toBe(200);
    expect(rows[0].netProfit).toBe(103);
    expect(rows[0].orderCount).toBe(1);
    // Idempotent: a second run updates, not duplicates.
    await jobRollupDaily();
    expect(await DailyRollupModel.countDocuments({ teamId: team._id })).toBe(1);
  });
});
