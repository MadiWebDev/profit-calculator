import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import { upsertShopifyOrder, type ShopifyOrder } from "@/lib/sync/shopify";
import { compileCustomerDataExport } from "@/lib/gdpr-export";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

function order(id: number, customer: { id: number; email: string }): ShopifyOrder {
  return {
    id,
    name: `#${id}`,
    created_at: "2026-10-01T10:00:00Z",
    currency: "USD",
    total_price: "120.00",
    subtotal_price: "110.00",
    total_discounts: "10.00",
    total_tax: "20.00",
    financial_status: "paid",
    line_items: [{ product_id: 55, variant_id: 77, title: "Widget", quantity: 2, price: "50.00" }],
    customer: { id: customer.id, email: customer.email, orders_count: 1 },
    email: customer.email,
  };
}

describe("GDPR data_request export", () => {
  it("exports only the requested customer's orders, without merchant-internal fields", async () => {
    const team = await TeamModel.create({
      name: "GDPR Co",
      slug: `gdpr-co-${Date.now()}`,
      ownerId: new mongoose.Types.ObjectId(),
    });
    const store = await StoreModel.create({ teamId: team._id, name: "GDPR store", platform: "shopify", domain: "gdpr.myshopify.com" });
    await upsertShopifyOrder(order(7001, { id: 9, email: "a@example.com" }), store._id.toString(), team._id.toString(), "USD");
    await upsertShopifyOrder(order(7002, { id: 10, email: "b@example.com" }), store._id.toString(), team._id.toString(), "USD");

    const data = await compileCustomerDataExport({
      storeId: store._id,
      shopDomain: "gdpr.myshopify.com",
      customerId: "9",
      customerEmail: "a@example.com",
    });
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].orderNumber).toBe("#7001");
    expect(data.orders[0].lineItems[0].name).toBe("Widget");
    // Merchant-internal analytics must never leak into a customer export.
    expect(data.orders[0]).not.toHaveProperty("netProfit");
    expect(data.orders[0].lineItems[0]).not.toHaveProperty("cogs");
    expect(data.orders[0].lineItems[0]).not.toHaveProperty("totalCogs");

    const empty = await compileCustomerDataExport({
      storeId: store._id,
      shopDomain: "gdpr.myshopify.com",
      customerId: "999",
    });
    expect(empty.orders).toHaveLength(0);
  });
});
