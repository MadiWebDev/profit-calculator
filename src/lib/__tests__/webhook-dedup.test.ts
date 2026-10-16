/**
 * Webhook dedup tests — Phase 12.
 * Atomic claim: exactly one concurrent delivery processes; duplicates,
 * failed retries, and stale claims behave correctly.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import { claimWebhookEvent, finishWebhookEvent, STALE_RECEIVED_MS } from "@/lib/webhook-dedup";
import { WebhookEventModel } from "@/models/WebhookEvent";

beforeAll(async () => {
  await setupTestDb();
  // Index builds are async in the background — the race tests need the
  // unique index on eventId to actually exist before they run.
  await WebhookEventModel.init();
});
afterAll(async () => {
  await teardownTestDb();
});
beforeEach(async () => {
  await clearDb();
});

const base = {
  eventId: "evt_test_1",
  source: "paddle",
  eventType: "subscription.created",
};

describe("claimWebhookEvent", () => {
  it("first delivery wins with 'process'", async () => {
    expect(await claimWebhookEvent(base)).toBe("process");
    const row = await WebhookEventModel.findOne({ eventId: base.eventId }).lean();
    expect(row?.status).toBe("received");
  });

  it("a redelivery of a processed event is a duplicate", async () => {
    expect(await claimWebhookEvent(base)).toBe("process");
    await finishWebhookEvent(base.eventId, { status: "processed" });
    expect(await claimWebhookEvent(base)).toBe("duplicate");
    const rows = await WebhookEventModel.find({ eventId: base.eventId }).lean();
    expect(rows.length).toBe(1);
  });

  it("exactly one concurrent first delivery processes", async () => {
    const [a, b] = await Promise.all([
      claimWebhookEvent({ ...base, eventId: "evt_race_1" }),
      claimWebhookEvent({ ...base, eventId: "evt_race_1" }),
    ]);
    expect([a, b].sort()).toEqual(["duplicate", "process"]);
    const rows = await WebhookEventModel.find({ eventId: "evt_race_1" }).lean();
    expect(rows.length).toBe(1);
  });

  it("a failed event is reprocessed exactly once on retry", async () => {
    expect(await claimWebhookEvent(base)).toBe("process");
    await finishWebhookEvent(base.eventId, { status: "failed", error: "boom" });
    // Two simultaneous Paddle retries — only one may reprocess
    const [a, b] = await Promise.all([claimWebhookEvent(base), claimWebhookEvent(base)]);
    expect([a, b].sort()).toEqual(["duplicate", "process"]);
  });

  it("a stale 'received' row is taken over", async () => {
    expect(await claimWebhookEvent(base)).toBe("process");
    // Simulate a crashed worker: backdate createdAt past the stale cutoff.
    // (Via the raw collection — Mongoose strips createdAt from updates.)
    const staleDate = new Date(Date.now() - STALE_RECEIVED_MS - 60 * 1000);
    await WebhookEventModel.collection.updateOne(
      { eventId: base.eventId },
      { $set: { createdAt: staleDate } }
    );
    expect(await claimWebhookEvent(base)).toBe("process");
  });

  it("a fresh 'received' row is not taken over", async () => {
    expect(await claimWebhookEvent(base)).toBe("process");
    // Second delivery while the first is still processing
    expect(await claimWebhookEvent(base)).toBe("duplicate");
  });
});
