/**
 * Server-bridge test (in-memory Mongo) for product aggregates.
 * Seeds a team with orders and asserts `getComputedProductAggregates`
 * returns the live per-product numbers the Products page and COGS Hub
 * read — i.e. the read path no longer depends on the never-written
 * stored `Product.totalRevenue` / `totalOrders` fields.
 *
 * Run this file alone: DB suites share ./.mongo-mem and flake in
 * parallel with other DB suites.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { getComputedProductAggregates } from "@/lib/product-aggregates-server";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe("getComputedProductAggregates", () => {
  it("computes live aggregates from order line items (cancelled excluded)", async () => {
    const team = await TeamModel.create({
      name: `Agg ${Date.now()}`,
      slug: `agg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ownerId: new mongoose.Types.ObjectId(),
    });
    const store = await StoreModel.create({
      teamId: team._id,
      name: "Agg store",
      platform: "shopify",
      domain: "agg.myshopify.com",
    });

    const base = {
      teamId: team._id,
      storeId: store._id,
      currency: "USD",
      status: "fulfilled" as const,
      orderDate: new Date(),
    };
    // Two fulfilled orders for Shopify product "1001" (2×$100, COGS 2×$40;
    // then 1×$100, COGS 1×$40) + one cancelled order that must not count.
    await OrderModel.create({
      ...base,
      externalId: "o-1",
      lineItems: [
        { productId: "1001", name: "Widget", quantity: 2, price: 100, cogs: 40, totalRevenue: 200, totalCogs: 80 },
      ],
    });
    await OrderModel.create({
      ...base,
      externalId: "o-2",
      lineItems: [
        { productId: "1001", name: "Widget", quantity: 1, price: 100, cogs: 40, totalRevenue: 100, totalCogs: 40 },
        { sku: "MANUAL-1", name: "Manual", quantity: 1, price: 50, cogs: 10, totalRevenue: 50, totalCogs: 10 },
      ],
    });
    await OrderModel.create({
      ...base,
      externalId: "o-3",
      status: "cancelled",
      lineItems: [
        { productId: "1001", name: "Widget", quantity: 10, price: 100, cogs: 40, totalRevenue: 1000, totalCogs: 400 },
      ],
    });

    const { baseCurrency, aggregates } = await getComputedProductAggregates(
      team._id.toString(),
    );
    expect(baseCurrency).toBe("USD");

    const widget = aggregates.get("1001");
    expect(widget).toMatchObject({
      totalRevenue: 300,
      totalCogs: 120,
      totalProfit: 180,
      totalOrders: 2,
      avgProfitMargin: 60,
      avgPrice: 150,
    });

    // Manual order (no productId) aggregates under its sku.
    expect(aggregates.get("MANUAL-1")).toMatchObject({
      totalRevenue: 50,
      totalProfit: 40,
      totalOrders: 1,
    });
  });
});
