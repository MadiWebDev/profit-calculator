/**
 * Phase 6 server bridge integration tests (in-memory Mongo).
 * Covers: delivered shipment writes its actual cost to the linked
 * order and recomputes net profit; RTO sets rtoLoss; a shipment with
 * no linked order is a no-op, never an error.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import ShipmentModel from "@/models/Shipment";
import { applyShipmentToOrder, loadTeamShipments } from "@/lib/courier-server";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function setup() {
  const team = await TeamModel.create({
    name: `Courier ${Date.now()} ${Math.random()}`,
    slug: `courier-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ownerId: new mongoose.Types.ObjectId(),
  });
  const store = await StoreModel.create({
    teamId: team._id, name: "Courier store", platform: "shopify", domain: "courier.myshopify.com",
  });
  return { team, store };
}

async function makeOrder(teamId: mongoose.Types.ObjectId, storeId: mongoose.Types.ObjectId) {
  return OrderModel.create({
    teamId, storeId,
    externalId: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    orderNumber: "#7001",
    orderDate: new Date(),
    currency: "USD",
    grossRevenue: 200,
    discounts: 0,
    netRevenue: 200,
    totalCogs: 80,
    shippingCost: 0,
    shippingRevenue: 0,
    transactionFees: 5,
    taxes: 0,
    refundAmount: 0,
    chargebackAmount: 0,
    adSpendAllocated: 0,
    netProfit: 115,
    profitMargin: 57.5,
    lineItems: [{ name: "Widget", quantity: 1, price: 200, cogs: 80, totalRevenue: 200, totalCogs: 80 }],
    packagingCost: 5,
    status: "pending",
  });
}

describe("courier-server profit write-back", () => {
  it("delivered shipment writes actual cost and recomputes profit", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id);
    const shipment = await ShipmentModel.create({
      teamId: team._id, courier: "TCS", trackingNumber: "TRK1",
      city: "Lahore", status: "delivered", cost: 12, bookedAt: new Date(),
      deliveredAt: new Date(), orderId: order._id, source: "manual",
    });
    expect(await applyShipmentToOrder(shipment._id.toString(), team._id.toString())).toBe(true);
    const saved = await OrderModel.findById(order._id).lean();
    expect(saved?.shippingCost).toBe(12);
    // 200 revenue - 80 cogs - 12 shipping - 5 fees - 5 packaging = 98
    expect(saved?.netProfit).toBe(98);
    expect(saved?.trackingNumber).toBe("TRK1");
    expect(saved?.trackingCompany).toBe("TCS");
  });

  it("RTO shipment sets rtoLoss = cost + packaging", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id);
    const shipment = await ShipmentModel.create({
      teamId: team._id, courier: "TCS", trackingNumber: "TRK2",
      city: "Karachi", status: "returned_rto", cost: 12, bookedAt: new Date(),
      orderId: order._id, source: "manual",
    });
    expect(await applyShipmentToOrder(shipment._id.toString(), team._id.toString())).toBe(true);
    const saved = await OrderModel.findById(order._id).lean();
    expect(saved?.rtoLoss).toBe(17); // 12 shipping + 5 packaging
  });

  it("unlinked shipment is a no-op", async () => {
    const { team } = await setup();
    const shipment = await ShipmentModel.create({
      teamId: team._id, courier: "TCS", trackingNumber: "TRK3",
      city: "Lahore", status: "delivered", cost: 12, bookedAt: new Date(),
      source: "manual",
    });
    expect(await applyShipmentToOrder(shipment._id.toString(), team._id.toString())).toBe(false);
  });

  it("loadTeamShipments returns lib-shaped inputs", async () => {
    const { team } = await setup();
    await ShipmentModel.create({
      teamId: team._id, courier: "DHL", trackingNumber: "TRK4",
      city: "Islamabad", status: "in_transit", cost: 20, bookedAt: new Date(),
      source: "manual",
    });
    const rows = await loadTeamShipments(team._id.toString());
    expect(rows.some((r) => r.courier === "DHL" && r.city === "Islamabad")).toBe(true);
  });
});
