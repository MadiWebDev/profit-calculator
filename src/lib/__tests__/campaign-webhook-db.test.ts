/**
 * DB-backed Phase 2 webhook ingestion tests — the guarantees real
 * delivery tracking stands on:
 *  - a redelivered webhook (same Svix id / same body hash) is
 *    acknowledged without reprocessing
 *  - an event moves the recipient's derived status only through a
 *    valid transition, and stamps the matching timestamp
 *  - an out-of-order event is logged but cannot move the status
 *    backwards (read after bounced stays bounced)
 *  - stats are recomputed from the recipients array after each event
 *  - bounced/complained emails land in the suppression list, and a
 *    complaint stamps User.emailUnsubscribedAt
 *  - unknown message ids (pre-Phase 1 sends, test messages) are
 *    acknowledged, never counted
 *
 * DB-backed: run this file on its own (see setup-db.ts); the suite
 * shares ./.mongo-mem with the other DB files.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import CampaignModel, { type ICampaignRecipient } from "@/models/Campaign";
import MessageEventModel from "@/models/MessageEvent";
import ProviderWebhookEventModel from "@/models/ProviderWebhookEvent";
import MessageSuppressionModel from "@/models/MessageSuppression";
import UserModel from "@/models/User";
import {
  processResendWebhook,
  processWhatsappWebhook,
} from "@/lib/campaign-tracking";

beforeAll(async () => {
  await setupTestDb();
  // The dedup tests depend on the unique indexes existing BEFORE the
  // first insert (same race as the Phase 1 DB suite).
  await MessageEventModel.syncIndexes();
  await ProviderWebhookEventModel.syncIndexes();
  await MessageSuppressionModel.syncIndexes();
  await CampaignModel.syncIndexes();
  await UserModel.syncIndexes();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await clearDb();
});

const EMPTY_STATS = {
  targeted: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  overflow: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  read: 0,
  suppressed: 0,
};

async function seedCampaign(input: {
  channel: "email" | "whatsapp";
  recipients: Array<{
    identifier: string;
    status: "sent" | "bounced";
    providerMessageId: string;
  }>;
}) {
  const sent = input.recipients.filter((r) => r.status === "sent").length;
  return CampaignModel.create({
    name: "Phase 2 test campaign",
    channel: input.channel,
    templateType: "announcement",
    body: "Hello {{name}}",
    audienceType: "users",
    status: "sent",
    createdBy: new mongoose.Types.ObjectId(),
    stats: { ...EMPTY_STATS, targeted: input.recipients.length, sent },
    recipients: input.recipients.map((r) => ({
      identifier: r.identifier,
      status: r.status,
      providerMessageId: r.providerMessageId,
      sentAt: new Date("2026-11-19T10:00:00.000Z"),
    })),
  });
}

function resendPayload(type: string, emailId: string, to: string) {
  return {
    type,
    created_at: "2026-11-19T12:00:00.000Z",
    data: { email_id: emailId, to: [to], subject: "Hi" },
  };
}

describe("processResendWebhook", () => {
  it("moves sent → delivered, stamps deliveredAt, recomputes stats", async () => {
    const campaign = await seedCampaign({
      channel: "email",
      recipients: [
        { identifier: "aisha@example.com", status: "sent", providerMessageId: "re_1" },
        { identifier: "bilal@example.com", status: "sent", providerMessageId: "re_2" },
      ],
    });
    const result = await processResendWebhook({
      payload: resendPayload("email.delivered", "re_1", "aisha@example.com"),
      svixId: "msg_1",
    });
    expect(result).toMatchObject({ outcome: "processed", applied: 1 });

    const fresh = await CampaignModel.findById(campaign._id).lean();
    const aisha = fresh?.recipients.find((r: ICampaignRecipient) => r.providerMessageId === "re_1");
    expect(aisha?.status).toBe("delivered");
    expect(aisha?.deliveredAt?.toISOString()).toBe("2026-11-19T12:00:00.000Z");
    expect(fresh?.stats.delivered).toBe(1);
    // The counters are a distribution over CURRENT statuses: aisha
    // moved sent → delivered, so "sent" is now only bilal. The
    // distribution always sums to targeted (no double counting).
    expect(fresh?.stats.sent).toBe(1);
    expect(fresh?.stats.targeted).toBe(2);
    // The other recipient is untouched.
    expect(
      fresh?.recipients.find((r: ICampaignRecipient) => r.providerMessageId === "re_2")?.status
    ).toBe("sent");

    const events = await MessageEventModel.find({ providerMessageId: "re_1" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("delivered");
    const raw = await ProviderWebhookEventModel.findOne({
      providerEventId: "resend:msg_1",
    }).lean();
    expect(raw?.processed).toBe(true);
  });

  it("acknowledges a redelivery without reprocessing", async () => {
    await seedCampaign({
      channel: "email",
      recipients: [
        { identifier: "aisha@example.com", status: "sent", providerMessageId: "re_1" },
      ],
    });
    const payload = resendPayload("email.delivered", "re_1", "aisha@example.com");
    const first = await processResendWebhook({ payload, svixId: "msg_1" });
    expect(first.applied).toBe(1);
    const second = await processResendWebhook({ payload, svixId: "msg_1" });
    expect(second.outcome).toBe("duplicate");
    expect(second.applied).toBe(0);
    expect(
      await MessageEventModel.countDocuments({ providerMessageId: "re_1" })
    ).toBe(1);
  });

  it("recreates the dedup indexes when they are missing, so a redelivery still dedups", async () => {
    await seedCampaign({
      channel: "email",
      recipients: [
        { identifier: "aisha@example.com", status: "sent", providerMessageId: "re_1" },
      ],
    });
    // Simulate a deployment where the unique indexes were never
    // created: drop them, then process the same delivery twice. The
    // first call must recreate the indexes before inserting, or the
    // redelivery sails through (the exact failure the Phase 2 smoke
    // caught on a fresh database). A fresh module graph simulates a
    // fresh server boot — the once-per-instance index sync in
    // message-events.ts has not run yet there.
    await ProviderWebhookEventModel.collection
      .dropIndex("providerEventId_1")
      .catch(() => undefined);
    await MessageEventModel.collection
      .dropIndex("providerEventId_1")
      .catch(() => undefined);
    vi.resetModules();
    const fresh = await import("@/lib/campaign-tracking");
    const payload = resendPayload("email.delivered", "re_1", "aisha@example.com");
    const first = await fresh.processResendWebhook({ payload, svixId: "msg_1" });
    expect(first.applied).toBe(1);
    const second = await fresh.processResendWebhook({ payload, svixId: "msg_1" });
    expect(second.outcome).toBe("duplicate");
    expect(
      await MessageEventModel.countDocuments({ providerMessageId: "re_1" })
    ).toBe(1);
  });

  it("logs an out-of-order event but never moves the status backwards", async () => {
    await seedCampaign({
      channel: "email",
      recipients: [
        { identifier: "aisha@example.com", status: "bounced", providerMessageId: "re_1" },
      ],
    });
    const result = await processResendWebhook({
      payload: resendPayload("email.delivered", "re_1", "aisha@example.com"),
      svixId: "msg_9",
    });
    expect(result).toMatchObject({ applied: 0, noTransition: 1 });
    const fresh = await CampaignModel.findOne({
      "recipients.providerMessageId": "re_1",
    }).lean();
    expect(
      fresh?.recipients.find((r: ICampaignRecipient) => r.providerMessageId === "re_1")?.status
    ).toBe("bounced");
    // Evidence is kept even though the status did not move.
    expect(
      await MessageEventModel.countDocuments({
        providerMessageId: "re_1",
        eventType: "delivered",
      })
    ).toBe(1);
  });

  it("writes a bounce to the suppression list", async () => {
    await seedCampaign({
      channel: "email",
      recipients: [
        { identifier: "aisha@example.com", status: "sent", providerMessageId: "re_1" },
      ],
    });
    const result = await processResendWebhook({
      payload: resendPayload("email.bounced", "re_1", "aisha@example.com"),
      svixId: "msg_bounce",
    });
    expect(result.applied).toBe(1);
    const suppression = await MessageSuppressionModel.findOne({
      identifier: "aisha@example.com",
      channel: "email",
    }).lean();
    expect(suppression?.reason).toBe("bounced");
    expect(suppression?.source).toBe("webhook");
    const fresh = await CampaignModel.findOne({
      "recipients.providerMessageId": "re_1",
    }).lean();
    const aisha = fresh?.recipients.find((r: ICampaignRecipient) => r.providerMessageId === "re_1");
    expect(aisha?.status).toBe("bounced");
    expect(aisha?.failedAt).not.toBeUndefined();
    expect(fresh?.stats.bounced).toBe(1);
  });

  it("writes a complaint to the suppression list and stamps the user opt-out", async () => {
    await UserModel.create({
      name: "Aisha",
      email: "aisha@example.com",
      passwordHash: "x".repeat(60),
    });
    await seedCampaign({
      channel: "email",
      recipients: [
        { identifier: "aisha@example.com", status: "sent", providerMessageId: "re_1" },
      ],
    });
    await processResendWebhook({
      payload: resendPayload("email.complained", "re_1", "aisha@example.com"),
      svixId: "msg_complaint",
    });
    const suppression = await MessageSuppressionModel.findOne({
      identifier: "aisha@example.com",
      channel: "email",
    }).lean();
    expect(suppression?.reason).toBe("complained");
    const user = await UserModel.findOne({ email: "aisha@example.com" }).lean();
    expect(user?.emailUnsubscribedAt).not.toBeUndefined();
  });

  it("acknowledges an unknown message id without counting it", async () => {
    const result = await processResendWebhook({
      payload: resendPayload("email.delivered", "re_unknown", "ghost@example.com"),
      svixId: "msg_ghost",
    });
    expect(result).toMatchObject({ outcome: "processed", unknownMessage: 1 });
    expect(await MessageEventModel.countDocuments()).toBe(0);
  });

  it("acknowledges an unmapped type without a status change", async () => {
    await seedCampaign({
      channel: "email",
      recipients: [
        { identifier: "aisha@example.com", status: "sent", providerMessageId: "re_1" },
      ],
    });
    const result = await processResendWebhook({
      payload: resendPayload("email.delivery_delayed", "re_1", "aisha@example.com"),
      svixId: "msg_delayed",
    });
    expect(result).toMatchObject({ ignored: 1, applied: 0 });
    expect(await MessageEventModel.countDocuments()).toBe(0);
  });
});

describe("processWhatsappWebhook", () => {
  function whatsappPayload(statuses: Array<{
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
  }>) {
    return {
      object: "whatsapp_business_account",
      entry: [
        { id: "123", changes: [{ field: "messages", value: { statuses } }] },
      ],
    };
  }

  it("moves sent → delivered and dedups an identical redelivery", async () => {
    await seedCampaign({
      channel: "whatsapp",
      recipients: [
        { identifier: "923001234567", status: "sent", providerMessageId: "wamid.AAA" },
      ],
    });
    const payload = whatsappPayload([
      {
        id: "wamid.AAA",
        status: "delivered",
        timestamp: "1793030400",
        recipient_id: "923001234567",
      },
    ]);
    const first = await processWhatsappWebhook({
      payload,
      deliveryId: "whatsapp:hash_1",
    });
    expect(first).toMatchObject({ outcome: "processed", applied: 1 });
    const second = await processWhatsappWebhook({
      payload,
      deliveryId: "whatsapp:hash_1",
    });
    expect(second.outcome).toBe("duplicate");
    const fresh = await CampaignModel.findOne({
      "recipients.providerMessageId": "wamid.AAA",
    }).lean();
    const recipient = fresh?.recipients.find(
      (r: ICampaignRecipient) => r.providerMessageId === "wamid.AAA"
    );
    expect(recipient?.status).toBe("delivered");
    expect(recipient?.deliveredAt?.getTime()).toBe(1793030400 * 1000);
    expect(fresh?.stats.read).toBe(0);
  });

  it("applies read then refuses a later delivered (read is terminal)", async () => {
    await seedCampaign({
      channel: "whatsapp",
      recipients: [
        { identifier: "923001234567", status: "sent", providerMessageId: "wamid.AAA" },
      ],
    });
    const read = await processWhatsappWebhook({
      payload: whatsappPayload([
        {
          id: "wamid.AAA",
          status: "read",
          timestamp: "1793030500",
          recipient_id: "923001234567",
        },
      ]),
      deliveryId: "whatsapp:hash_read",
    });
    expect(read.applied).toBe(1);
    const late = await processWhatsappWebhook({
      payload: whatsappPayload([
        {
          id: "wamid.AAA",
          status: "delivered",
          timestamp: "1793030400",
          recipient_id: "923001234567",
        },
      ]),
      deliveryId: "whatsapp:hash_late",
    });
    expect(late).toMatchObject({ applied: 0, noTransition: 1 });
    const fresh = await CampaignModel.findOne({
      "recipients.providerMessageId": "wamid.AAA",
    }).lean();
    expect(
      fresh?.recipients.find((r: ICampaignRecipient) => r.providerMessageId === "wamid.AAA")?.status
    ).toBe("read");
    expect(fresh?.stats.read).toBe(1);
    expect(fresh?.stats.delivered).toBe(0);
  });
});
