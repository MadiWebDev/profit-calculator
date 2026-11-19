/**
 * DB-backed Phase 1 foundation tests — the safety guarantees the whole
 * campaign upgrade stands on:
 *  - a re-delivered provider webhook is recorded exactly once
 *    (MessageEvent + ProviderWebhookEvent idempotency)
 *  - a suppression is stored once per (identifier, channel) and is
 *    visible to the send-time check
 *  - two concurrent send claims cannot both win (the duplicate-send
 *    fix), and a non-sendable campaign cannot be claimed at all
 *
 * DB-backed: run this file on its own (see setup-db.ts); the suite
 * shares ./.mongo-mem with the other DB files.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import CampaignModel from "@/models/Campaign";
import MessageEventModel from "@/models/MessageEvent";
import ProviderWebhookEventModel from "@/models/ProviderWebhookEvent";
import MessageSuppressionModel from "@/models/MessageSuppression";
import {
  buildSendClaimFilter,
  buildSendClaimUpdate,
} from "@/lib/campaigns";
import { recordMessageEvent, recordWebhookEvent } from "@/lib/message-events";
import { suppress, isSuppressed, unsuppress } from "@/lib/suppression";

beforeAll(async () => {
  await setupTestDb();
  // The dedup tests depend on the unique indexes existing BEFORE the
  // first insert: Mongoose builds indexes in the background, and an
  // insert that lands before the unique index exists would not raise
  // a duplicate-key error. Await them here so the tests are
  // deterministic instead of racing the index build.
  await MessageEventModel.syncIndexes();
  await ProviderWebhookEventModel.syncIndexes();
  await MessageSuppressionModel.syncIndexes();
  await CampaignModel.syncIndexes();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await clearDb();
});

describe("recordMessageEvent idempotency", () => {
  it("records a re-delivered webhook event exactly once", async () => {
    const campaignId = new mongoose.Types.ObjectId().toString();
    const input = {
      campaignId,
      identifier: "aisha@example.com",
      channel: "email" as const,
      provider: "resend" as const,
      providerMessageId: "re_123",
      providerEventId: "evt_resend_1",
      eventType: "delivered" as const,
    };
    const first = await recordMessageEvent(input);
    const second = await recordMessageEvent(input);
    expect(first).toEqual({ created: true });
    expect(second).toEqual({ created: false, reason: "duplicate" });
    expect(await MessageEventModel.countDocuments({ providerEventId: "evt_resend_1" })).toBe(1);
  });

  it("stores events without a provider event id (nothing to dedup on)", async () => {
    const campaignId = new mongoose.Types.ObjectId().toString();
    const first = await recordMessageEvent({
      campaignId,
      identifier: "aisha@example.com",
      channel: "email",
      provider: "resend",
      eventType: "sent",
    });
    expect(first.created).toBe(true);
    expect(await MessageEventModel.countDocuments({ campaignId })).toBe(1);
  });
});

describe("recordWebhookEvent dedup", () => {
  it("reports the second delivery of the same webhook as already seen", async () => {
    const input = {
      provider: "whatsapp" as const,
      providerEventId: "wamid_1:delivered:1700000000",
      payload: { object: "whatsapp_business_account" },
    };
    expect(await recordWebhookEvent(input)).toEqual({ isNew: true });
    expect(await recordWebhookEvent(input)).toEqual({ isNew: false });
    expect(
      await ProviderWebhookEventModel.countDocuments({
        providerEventId: "wamid_1:delivered:1700000000",
      })
    ).toBe(1);
  });
});

describe("suppression round-trip", () => {
  it("suppresses an email address on the email channel only", async () => {
    await suppress({
      identifier: "  Aisha@Example.com ",
      channel: "email",
      reason: "unsubscribed",
      source: "unsubscribe_link",
    });
    expect(await isSuppressed("aisha@example.com", "email")).toBe(true);
    expect(await isSuppressed("AISHA@example.com", "email")).toBe(true);
    expect(await isSuppressed("aisha@example.com", "whatsapp")).toBe(false);
    // One row per (identifier, channel): a second suppress updates, never duplicates.
    await suppress({
      identifier: "aisha@example.com",
      channel: "email",
      reason: "complained",
      source: "webhook",
    });
    expect(await MessageSuppressionModel.countDocuments({ identifier: "aisha@example.com" })).toBe(1);
    const row = await MessageSuppressionModel.findOne({ identifier: "aisha@example.com" }).lean();
    expect(row?.reason).toBe("complained");
  });

  it("channel 'all' suppresses both channels, and unsuppress removes it", async () => {
    await suppress({
      identifier: "+923001234567",
      channel: "all",
      reason: "manual",
      source: "admin",
    });
    expect(await isSuppressed("+923001234567", "email")).toBe(true);
    expect(await isSuppressed("+923001234567", "whatsapp")).toBe(true);
    expect(await unsuppress("+923001234567", "all")).toBe(true);
    expect(await isSuppressed("+923001234567", "email")).toBe(false);
    expect(await unsuppress("+923001234567", "all")).toBe(false);
  });
});

describe("atomic send claim", () => {
  it("lets exactly one of two concurrent claims win", async () => {
    const campaign = await CampaignModel.create({
      name: "Race test",
      channel: "email",
      templateType: "announcement",
      body: "hello",
      createdBy: new mongoose.Types.ObjectId(),
      status: "draft",
    });
    const claim = () =>
      CampaignModel.findOneAndUpdate(
        buildSendClaimFilter(campaign._id.toString()),
        buildSendClaimUpdate(),
        { new: true }
      );
    const [first, second] = await Promise.all([claim(), claim()]);
    const winners = [first, second].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.status).toBe("sending");
    const after = await CampaignModel.findById(campaign._id).lean();
    expect(after?.status).toBe("sending");
  });

  it("refuses to claim a campaign that is already sent", async () => {
    const campaign = await CampaignModel.create({
      name: "Already sent",
      channel: "email",
      templateType: "announcement",
      body: "hello",
      createdBy: new mongoose.Types.ObjectId(),
      status: "sent",
    });
    const claimed = await CampaignModel.findOneAndUpdate(
      buildSendClaimFilter(campaign._id.toString()),
      buildSendClaimUpdate(),
      { new: true }
    );
    expect(claimed).toBeNull();
  });

  it("claims a failed campaign so it can be re-sent", async () => {
    const campaign = await CampaignModel.create({
      name: "Failed once",
      channel: "email",
      templateType: "announcement",
      body: "hello",
      createdBy: new mongoose.Types.ObjectId(),
      status: "failed",
      error: "boom",
    });
    const claimed = await CampaignModel.findOneAndUpdate(
      buildSendClaimFilter(campaign._id.toString()),
      buildSendClaimUpdate(),
      { new: true }
    );
    expect(claimed?.status).toBe("sending");
    expect(claimed?.error).toBeUndefined();
  });
});
