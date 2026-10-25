/**
 * Tenant isolation + Phase 2 Shopify sync tests.
 * Every query a merchant can trigger must be scoped by teamId (and
 * storeId where applicable); these tests prove a second tenant's data
 * is invisible, and that the COGS fallback + cancellation handling work.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { upsertShopifyOrder, type ShopifyOrder } from "@/lib/sync/shopify";
import { parseVariantCostsPage } from "@/lib/shopify-graphql";
import { recomputeProfitAfterRefund } from "@/app/api/webhooks/shopify/[topic]/route";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

let teamSeq = 0;
async function makeTeam(name: string) {
  teamSeq++;
  return TeamModel.create({
    name,
    slug: `team-${name.toLowerCase()}-${teamSeq}-${Date.now()}`,
    ownerId: new mongoose.Types.ObjectId(),
  });
}

function shopifyOrder(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: 1001,
    name: "#1001",
    created_at: "2026-10-01T10:00:00Z",
    currency: "USD",
    total_price: "120.00",
    subtotal_price: "110.00",
    total_discounts: "10.00",
    total_tax: "20.00",
    financial_status: "paid",
    line_items: [
      { product_id: 55, variant_id: 77, title: "Widget", quantity: 2, price: "50.00" },
    ],
    customer: { id: 9, email: "a@example.com", orders_count: 1 },
    email: "a@example.com",
    ...overrides,
  };
}

describe("tenant isolation", () => {
  it("team-scoped queries never return another team's orders", async () => {
    const teamA = await makeTeam("A");
    const teamB = await makeTeam("B");
    const storeA = await StoreModel.create({ teamId: teamA._id, name: "A store", platform: "shopify", domain: "a.myshopify.com" });
    const storeB = await StoreModel.create({ teamId: teamB._id, name: "B store", platform: "shopify", domain: "b.myshopify.com" });
    await upsertShopifyOrder(shopifyOrder({ id: 2001 }), storeA._id.toString(), teamA._id.toString(), "USD");
    await upsertShopifyOrder(shopifyOrder({ id: 2002 }), storeB._id.toString(), teamB._id.toString(), "USD");

    const aOrders = await OrderModel.find({ teamId: teamA._id }).lean();
    const bOrders = await OrderModel.find({ teamId: teamB._id }).lean();
    expect(aOrders.map((o) => o.externalId)).toEqual(["2001"]);
    expect(bOrders.map((o) => o.externalId)).toEqual(["2002"]);

    // A store-scoped lookup for team A must not find team B's store.
    const wrongStore = await StoreModel.findOne({ _id: storeB._id, teamId: teamA._id }).lean();
    expect(wrongStore).toBeNull();
  });

  it("upserting the same external order twice does not duplicate it", async () => {
    const team = await makeTeam("Dup");
    const store = await StoreModel.create({ teamId: team._id, name: "Dup store", platform: "shopify", domain: "dup.myshopify.com" });
    await upsertShopifyOrder(shopifyOrder({ id: 3001 }), store._id.toString(), team._id.toString(), "USD");
    await upsertShopifyOrder(shopifyOrder({ id: 3001, total_price: "130.00" }), store._id.toString(), team._id.toString(), "USD");
    const rows = await OrderModel.find({ teamId: team._id, externalId: "3001" }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].grossRevenue).toBe(110); // 130 - 20 tax
  });
});

describe("Phase 2 sync behaviour", () => {
  it("applies variant COGS from the fallback map and computes profit", async () => {
    const team = await makeTeam("COGS");
    const store = await StoreModel.create({ teamId: team._id, name: "COGS store", platform: "shopify", domain: "cogs.myshopify.com" });
    const cogs = new Map([["77", 15]]);
    await upsertShopifyOrder(shopifyOrder({ id: 4001 }), store._id.toString(), team._id.toString(), "USD", cogs);
    const order = await OrderModel.findOne({ teamId: team._id, externalId: "4001" }).lean();
    expect(order?.totalCogs).toBe(30); // 2 x 15
    // gross 100 (120-20 tax), no refunds/fees/shipping: profit = 100 - 30 = 70
    expect(order?.netProfit).toBe(70);
    expect(order?.lineItems[0].cogs).toBe(15);
  });

  it("marks an order cancelled when cancelled_at is present", async () => {
    const team = await makeTeam("Cancel");
    const store = await StoreModel.create({ teamId: team._id, name: "Cancel store", platform: "shopify", domain: "cancel.myshopify.com" });
    await upsertShopifyOrder(
      shopifyOrder({ id: 5001, financial_status: "paid", cancelled_at: "2026-10-02T00:00:00Z" }),
      store._id.toString(), team._id.toString(), "USD"
    );
    const order = await OrderModel.findOne({ teamId: team._id, externalId: "5001" }).lean();
    expect(order?.status).toBe("cancelled");
  });

  it("parses GraphQL variant-cost pages (gid → numeric id, missing cost → 0)", () => {
    const costs = parseVariantCostsPage({
      products: {
        edges: [
          {
            node: {
              id: "gid://shopify/Product/55",
              variants: {
                edges: [
                  { node: { id: "gid://shopify/ProductVariant/77", sku: "W-1", inventoryItem: { unitCost: { amount: "12.50" } } } },
                  { node: { id: "gid://shopify/ProductVariant/78", sku: null, inventoryItem: null } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    expect(costs).toEqual([
      { variantId: "77", productId: "55", sku: "W-1", cost: 12.5 },
      { variantId: "78", productId: "55", sku: null, cost: 0 },
    ]);
  });

  it("recomputes profit after a refund (refund reduces net revenue and profit)", () => {
    const r = recomputeProfitAfterRefund({
      grossRevenue: 100, refundAmount: 40, chargebackAmount: 0,
      totalCogs: 30, shippingCost: 5, transactionFees: 3, adSpendAllocated: 10,
    });
    expect(r.netRevenue).toBe(60);
    expect(r.netProfit).toBe(12); // 60 - 30 - 5 - 3 - 10
    expect(r.profitMargin).toBe(20);
  });
});
