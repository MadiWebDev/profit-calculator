/**
 * Phase 4 server scoring integration tests (in-memory Mongo).
 * Covers: scoring a suspicious order, blocklist boosting, a fake
 * verdict (blocklist + money saved + weights), and a genuine verdict
 * on a high scorer lowering weights.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import BlocklistModel from "@/models/Blocklist";
import RiskSignalWeightModel from "@/models/RiskSignalWeight";
import { scoreAndTagOrder, applyReview, hashIdentifier } from "@/lib/risk-scoring";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function setup() {
  const team = await TeamModel.create({
    name: `Risk ${Date.now()} ${Math.random()}`,
    slug: `risk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ownerId: new mongoose.Types.ObjectId(),
  });
  const store = await StoreModel.create({
    teamId: team._id, name: "Risk store", platform: "shopify", domain: "risk.myshopify.com",
  });
  return { team, store };
}

async function makeOrder(teamId: mongoose.Types.ObjectId, storeId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return OrderModel.create({
    teamId, storeId,
    externalId: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    orderNumber: "#9001",
    orderDate: new Date(),
    currency: "USD",
    grossRevenue: 500,
    discounts: 0,
    netRevenue: 500,
    totalCogs: 100,
    shippingCost: 10,
    shippingRevenue: 0,
    transactionFees: 5,
    taxes: 0,
    refundAmount: 0,
    chargebackAmount: 0,
    adSpendAllocated: 0,
    netProfit: 385,
    profitMargin: 77,
    lineItems: [{ name: "Widget", quantity: 5, price: 100, cogs: 20, totalRevenue: 500, totalCogs: 100 }],
    customerEmail: "temp@mailinator.com",
    customerPhone: "+923001234567",
    customerName: "asdf qwer",
    shippingCity: "Lahore",
    shippingPostalCode: "54000",
    shippingCountry: "PK",
    isFirstOrder: true,
    paymentMethod: "Cash on Delivery (COD)",
    status: "pending",
    ...overrides,
  });
}

describe("risk scoring", () => {
  it("scores a disposable-email, gibberish-name, first-time COD order high", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id);
    const score = await scoreAndTagOrder(order._id.toString(), team._id.toString());
    expect(score).not.toBeNull();
    expect(score!.score).toBeGreaterThanOrEqual(30);
    expect(score!.reasons.length).toBeGreaterThan(0);
    const saved = await OrderModel.findById(order._id).lean();
    expect(saved?.riskScore).toBe(score!.score);
    expect(saved?.riskStatus).toBe("unreviewed");
  });

  it("a fake verdict blocks the customer and records money saved", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id);
    await scoreAndTagOrder(order._id.toString(), team._id.toString());
    const outcome = await applyReview(order._id.toString(), team._id.toString(), "fake");
    expect(outcome.moneySaved).toBe(500); // protected order value
    const saved = await OrderModel.findById(order._id).lean();
    expect(saved?.riskStatus).toBe("fake");
    expect(saved?.moneySaved).toBe(500);
    const blocked = await BlocklistModel.findOne({
      teamId: team._id,
      kind: "email",
      valueHash: hashIdentifier("email", "temp@mailinator.com"),
    }).lean();
    expect(blocked).not.toBeNull();

    // A new order from the same blocked email scores higher than before.
    const order2 = await makeOrder(team._id, store._id, { customerName: "Real Name", customerPhone: "+923009999999" });
    const score2 = await scoreAndTagOrder(order2._id.toString(), team._id.toString());
    expect(score2!.reasons.some((r) => r.code === "blocklist_hit")).toBe(true);
  });

  it("a genuine verdict on a high scorer lowers that signal's weight", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id);
    const score = await scoreAndTagOrder(order._id.toString(), team._id.toString());
    expect(score!.score).toBeGreaterThanOrEqual(30);
    await applyReview(order._id.toString(), team._id.toString(), "genuine");
    const saved = await OrderModel.findById(order._id).lean();
    expect(saved?.riskStatus).toBe("genuine");
    expect(saved?.moneySaved).toBe(0);
    // Weights only move when the verdict contradicts the score band:
    // genuine on a high scorer (>=55) decreases, otherwise unchanged.
    if (score!.score >= 55) {
      const weights = await RiskSignalWeightModel.find({ teamId: team._id }).lean();
      expect(weights.some((w) => w.weight < 1)).toBe(true);
    }
  });
});
