/**
 * Phase 9a notify bridge integration tests (in-memory Mongo).
 * WhatsApp sending is stubbed at the fetch level (no real API call);
 * email sending is avoided by configuring WhatsApp-only rules.
 * Covers: no rule → nothing sent; WhatsApp send + dedup; COD
 * tracking substitution; missing contact → skipped.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import NotifyRuleModel from "@/models/NotifyRule";
import NotificationLogModel from "@/models/NotificationLog";
import { sendOrderNotification, sendWhatsAppMessage, fulfillmentStatusToEvent } from "@/lib/notify-server";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function setup() {
  const team = await TeamModel.create({
    name: `Notify ${Date.now()} ${Math.random()}`,
    slug: `notify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ownerId: new mongoose.Types.ObjectId(),
  });
  const store = await StoreModel.create({
    teamId: team._id, name: "Notify store", platform: "shopify", domain: "notify.myshopify.com",
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
    grossRevenue: 150,
    discounts: 0,
    netRevenue: 150,
    totalCogs: 60,
    shippingCost: 0,
    shippingRevenue: 0,
    transactionFees: 3,
    taxes: 0,
    refundAmount: 0,
    chargebackAmount: 0,
    adSpendAllocated: 0,
    netProfit: 87,
    profitMargin: 58,
    lineItems: [],
    customerEmail: "buyer@example.com",
    customerPhone: "+923001234567",
    customerName: "Ayesha Khan",
    status: "pending",
    ...overrides,
  });
}

describe("notify-server", () => {
  it("no rule means nothing is sent", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id);
    const outcome = await sendOrderNotification(order._id.toString(), team._id.toString(), "order_confirmed");
    expect(outcome.channels).toEqual([]);
    expect(await NotificationLogModel.countDocuments({ teamId: team._id, status: "sent" })).toBe(0);
  });

  it("sends WhatsApp once and dedups the second attempt", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id);
    await NotifyRuleModel.create({ teamId: team._id, event: "order_confirmed", channel: "whatsapp", enabled: true });
    const origToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const origId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    const fetchStub = vi.fn(async () => new Response("{}", { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchStub as unknown as typeof fetch;
    try {
      const first = await sendOrderNotification(order._id.toString(), team._id.toString(), "order_confirmed");
      expect(first.channels).toEqual(["whatsapp"]);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      const second = await sendOrderNotification(order._id.toString(), team._id.toString(), "order_confirmed");
      expect(second.channels).toEqual([]);
      expect(second.skipped).toContain("whatsapp already sent");
      expect(fetchStub).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = realFetch;
      if (origToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
      else process.env.WHATSAPP_ACCESS_TOKEN = origToken;
      if (origId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      else process.env.WHATSAPP_PHONE_NUMBER_ID = origId;
    }
  });

  it("COD shipment with an enabled cod_tracking rule sends the COD event", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id, {
      paymentMethod: "Cash on Delivery (COD)",
      trackingNumber: "TRK-COD-1",
      trackingCompany: "TCS",
    });
    await NotifyRuleModel.create({ teamId: team._id, event: "order_shipped", channel: "whatsapp", enabled: true });
    await NotifyRuleModel.create({ teamId: team._id, event: "cod_tracking", channel: "whatsapp", enabled: true });
    process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    const fetchStub = vi.fn(async () => new Response("{}", { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchStub as unknown as typeof fetch;
    try {
      const outcome = await sendOrderNotification(order._id.toString(), team._id.toString(), "order_shipped");
      expect(outcome.event).toBe("cod_tracking");
      expect(outcome.channels).toEqual(["whatsapp"]);
      const firstCall = fetchStub.mock.calls[0] as unknown as [string, { body: string }] | undefined;
      expect(firstCall).toBeDefined();
      const body = JSON.parse(firstCall![1].body) as { text: { body: string } };
      expect(body.text.body).toContain("TRK-COD-1");
      expect(body.text.body).toContain("cash-on-delivery");
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
  });

  it("missing contact skips the channel without failing", async () => {
    const { team, store } = await setup();
    const order = await makeOrder(team._id, store._id, { customerPhone: undefined, customerEmail: undefined });
    await NotifyRuleModel.create({ teamId: team._id, event: "order_confirmed", channel: "both", enabled: true });
    const outcome = await sendOrderNotification(order._id.toString(), team._id.toString(), "order_confirmed");
    expect(outcome.channels).toEqual([]);
  });

  it("fulfillment status mapping covers the customer-facing stages only", () => {
    expect(fulfillmentStatusToEvent("in_transit")).toBe("order_shipped");
    expect(fulfillmentStatusToEvent("out_for_delivery")).toBe("out_for_delivery");
    expect(fulfillmentStatusToEvent("delivered")).toBe("delivered");
    expect(fulfillmentStatusToEvent("success")).toBeNull();
    expect(fulfillmentStatusToEvent(undefined)).toBeNull();
  });

  it("WhatsApp sender reports missing credentials as skipped, not failed", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const result = await sendWhatsAppMessage("+923001234567", "hi");
    expect(result).toEqual({ ok: false, skipped: true, error: "WhatsApp credentials not configured" });
  });
});
