/**
 * DB-backed Phase 3 tests — the Campaign Center's data layer:
 *  - getCampaignCenterStats: KPIs, daily series, breakdowns, and the
 *    "Tracking unavailable" null rates, computed from real Campaign /
 *    MessageEvent / MessageSuppression documents
 *  - buildCampaignListFilter: the table's search / status / channel /
 *    date / archived filters, applied against real documents (not just
 *    shape assertions) — including the $expr activity-date anchor and
 *    the regex-escaped search term
 *
 * Route handlers themselves cannot be imported in vitest (the auth
 * chain pulls in next/server); the routes are thin wrappers over these
 * functions, and the Playwright smoke covers them end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import CampaignModel from "@/models/Campaign";
import MessageEventModel from "@/models/MessageEvent";
import MessageSuppressionModel from "@/models/MessageSuppression";
import {
  resolveDateRange,
} from "@/lib/campaign-stats";
import { getCampaignCenterStats } from "@/lib/campaign-stats-db";
import { buildCampaignListFilter } from "@/lib/campaigns";

beforeAll(async () => {
  await setupTestDb();
  await CampaignModel.syncIndexes();
  await MessageEventModel.syncIndexes();
  await MessageSuppressionModel.syncIndexes();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await clearDb();
});

const ADMIN = new mongoose.Types.ObjectId();

function stats(over: Record<string, number> = {}) {
  return {
    targeted: 0, sent: 0, failed: 0, skipped: 0, overflow: 0,
    delivered: 0, opened: 0, clicked: 0, bounced: 0,
    complained: 0, read: 0, suppressed: 0,
    ...over,
  };
}

async function seedCampaign(over: Record<string, unknown> = {}) {
  return CampaignModel.create({
    name: "Seed campaign",
    channel: "email",
    templateType: "announcement",
    body: "Seed body",
    audienceType: "all",
    status: "draft",
    createdBy: ADMIN,
    stats: stats(),
    recipients: [],
    ...over,
  });
}

async function seedEvent(over: Record<string, unknown> = {}) {
  return MessageEventModel.create({
    campaignId: new mongoose.Types.ObjectId(),
    identifier: "a@example.com",
    channel: "email",
    provider: "resend",
    providerMessageId: "re_1",
    providerEventId: `ev_${Math.random().toString(36).slice(2)}`,
    eventType: "delivered",
    occurredAt: new Date("2026-11-10T12:00:00Z"),
    ...over,
  });
}

describe("getCampaignCenterStats", () => {
  it("counts in-range campaigns by activity date and nulls empty rates", async () => {
    await seedCampaign({
      name: "Sent in range",
      status: "sent",
      sentAt: new Date("2026-11-10T10:00:00Z"),
      createdAt: new Date("2026-11-01T10:00:00Z"),
      stats: stats({ targeted: 10, sent: 8, delivered: 6, opened: 3, failed: 1, skipped: 1 }),
      recipients: [
        { identifier: "a@example.com", status: "delivered", sentAt: new Date("2026-11-10T10:00:00Z") },
        { identifier: "b@example.com", status: "sent", sentAt: new Date("2026-11-10T10:00:00Z") },
      ],
    });
    // Created long ago, sent long ago — outside the range entirely.
    await seedCampaign({
      name: "Old",
      status: "sent",
      sentAt: new Date("2026-09-01T10:00:00Z"),
      createdAt: new Date("2026-09-01T10:00:00Z"),
      stats: stats({ targeted: 99, sent: 99 }),
    });
    // Draft: anchored on createdAt, inside the range.
    await seedCampaign({
      name: "Draft in range",
      status: "draft",
      createdAt: new Date("2026-11-11T10:00:00Z"),
    });
    // Archived: excluded even though it is in range.
    await seedCampaign({
      name: "Archived",
      status: "sent",
      sentAt: new Date("2026-11-10T10:00:00Z"),
      createdAt: new Date("2026-11-10T10:00:00Z"),
      archived: true,
      stats: stats({ targeted: 50, sent: 50 }),
    });

    const range = resolveDateRange("custom", new Date("2026-11-19T12:00:00Z"), "2026-11-10", "2026-11-12");
    const out = await getCampaignCenterStats({ range, channel: null });
    expect(out.kpis.campaignsTotal).toBe(2);
    expect(out.kpis.campaignsSent).toBe(1);
    expect(out.kpis.campaignsDraft).toBe(1);
    expect(out.kpis.targeted).toBe(10);
    expect(out.kpis.sent).toBe(8);
    expect(out.kpis.delivered).toBe(6);
    expect(out.kpis.deliveryRate).toBeCloseTo(6 / 8);
    expect(out.kpis.openRate).toBeCloseTo(3 / 6);
    // 6 delivered, 0 clicked is a real 0% — not "no data". Read rate
    // has no WhatsApp deliveries at all, so it is null.
    expect(out.kpis.clickRate).toBe(0);
    expect(out.kpis.readRate).toBeNull();
    expect(out.hasTracking).toBe(false);
    // Daily: the 10th has 2 sends (both recipients); 11th + 12th are gaps.
    expect(out.daily).toHaveLength(3);
    expect(out.daily[0]).toMatchObject({ date: "2026-11-10", sent: 2, delivered: 0 });
    expect(out.daily[1]).toMatchObject({ date: "2026-11-11", sent: 0 });
  });

  it("merges webhook events into the daily series and reports tracking", async () => {
    const campaign = await seedCampaign({
      name: "Tracked",
      status: "sent",
      sentAt: new Date("2026-11-10T10:00:00Z"),
      createdAt: new Date("2026-11-10T10:00:00Z"),
      stats: stats({ targeted: 2, sent: 2, delivered: 1, opened: 1 }),
    });
    await seedEvent({
      campaignId: campaign._id,
      eventType: "delivered",
      occurredAt: new Date("2026-11-10T13:00:00Z"),
    });
    await seedEvent({
      campaignId: campaign._id,
      eventType: "opened",
      occurredAt: new Date("2026-11-11T09:00:00Z"),
    });

    const range = resolveDateRange("custom", new Date("2026-11-19T12:00:00Z"), "2026-11-10", "2026-11-11");
    const out = await getCampaignCenterStats({ range, channel: null });
    expect(out.hasTracking).toBe(true);
    expect(out.daily[0]).toMatchObject({ date: "2026-11-10", delivered: 1, opened: 0 });
    expect(out.daily[1]).toMatchObject({ date: "2026-11-11", delivered: 0, opened: 1 });
  });

  it("channel filter scopes rows, events, and suppressions", async () => {
    await seedCampaign({
      name: "Email one",
      channel: "email",
      status: "sent",
      sentAt: new Date("2026-11-10T10:00:00Z"),
      createdAt: new Date("2026-11-10T10:00:00Z"),
      stats: stats({ targeted: 4, sent: 4, delivered: 4 }),
    });
    await seedCampaign({
      name: "WhatsApp one",
      channel: "whatsapp",
      status: "sent",
      sentAt: new Date("2026-11-10T10:00:00Z"),
      createdAt: new Date("2026-11-10T10:00:00Z"),
      stats: stats({ targeted: 6, sent: 6, delivered: 3, read: 2 }),
    });
    await MessageSuppressionModel.create({
      identifier: "wa@example.com",
      channel: "whatsapp",
      reason: "bounced",
      source: "webhook",
    });
    await MessageSuppressionModel.create({
      identifier: "em@example.com",
      channel: "email",
      reason: "complained",
      source: "webhook",
    });

    const range = resolveDateRange("custom", new Date("2026-11-19T12:00:00Z"), "2026-11-10", "2026-11-10");
    const wa = await getCampaignCenterStats({ range, channel: "whatsapp" });
    expect(wa.kpis.campaignsTotal).toBe(1);
    expect(wa.kpis.sent).toBe(6);
    expect(wa.kpis.readRate).toBeCloseTo(2 / 3);
    expect(wa.kpis.unsubscribed).toBe(1);
    const all = await getCampaignCenterStats({ range, channel: null });
    expect(all.kpis.campaignsTotal).toBe(2);
    expect(all.kpis.unsubscribed).toBe(2);
  });
});

describe("buildCampaignListFilter", () => {
  async function findNames(query: Parameters<typeof buildCampaignListFilter>[0]) {
    const { filter, error } = buildCampaignListFilter(query);
    expect(error).toBeUndefined();
    const rows = await CampaignModel.find(filter).sort({ name: 1 }).lean();
    return rows.map((r) => r.name);
  }

  beforeEach(async () => {
    await seedCampaign({
      name: "November launch",
      body: "Big news for everyone",
      channel: "email",
      status: "sent",
      sentAt: new Date("2026-11-10T10:00:00Z"),
      createdAt: new Date("2026-11-01T10:00:00Z"),
    });
    await seedCampaign({
      name: "Trial ending reminder",
      body: "Your trial ends soon",
      channel: "whatsapp",
      templateType: "trial_ending",
      status: "draft",
      createdAt: new Date("2026-11-11T10:00:00Z"),
    });
    await seedCampaign({
      name: "Archived launch",
      body: "Old news",
      channel: "email",
      status: "sent",
      sentAt: new Date("2026-11-10T10:00:00Z"),
      createdAt: new Date("2026-11-10T10:00:00Z"),
      archived: true,
    });
  });

  it("searches name and body, case-insensitively", async () => {
    expect(await findNames({ q: "launch" })).toEqual(["November launch"]);
    expect(await findNames({ q: "TRIAL" })).toEqual(["Trial ending reminder"]);
    expect(await findNames({ q: "news for" })).toEqual(["November launch"]);
  });

  it("treats regex characters in the search literally", async () => {
    expect(await findNames({ q: "[" })).toEqual([]);
    expect(await findNames({ q: "launch [" })).toEqual([]);
  });

  it("filters by status, channel, and template type", async () => {
    expect(await findNames({ status: "draft" })).toEqual(["Trial ending reminder"]);
    expect(await findNames({ channel: "whatsapp" })).toEqual(["Trial ending reminder"]);
    expect(await findNames({ templateType: "trial_ending" })).toEqual(["Trial ending reminder"]);
    expect(await findNames({ channel: "email", status: "sent" })).toEqual(["November launch"]);
  });

  it("filters by activity date: a sent campaign matches on sentAt, a draft on createdAt", async () => {
    // November launch was created Nov 1 but SENT Nov 10 — it matches a
    // Nov 10 window (activity date), not a Nov 1 window.
    expect(await findNames({ from: "2026-11-10", to: "2026-11-10" })).toEqual([
      "November launch",
    ]);
    expect(await findNames({ from: "2026-11-01", to: "2026-11-01" })).toEqual([]);
    expect(await findNames({ from: "2026-11-11", to: "2026-11-11" })).toEqual([
      "Trial ending reminder",
    ]);
  });

  it("hides archived by default, shows them on request", async () => {
    expect(await findNames({})).toEqual(["November launch", "Trial ending reminder"]);
    expect(await findNames({ archived: "true" })).toEqual(["Archived launch"]);
    expect(await findNames({ archived: "all" })).toEqual([
      "Archived launch",
      "November launch",
      "Trial ending reminder",
    ]);
  });

  it("sorts by name ascending", async () => {
    const { sort } = buildCampaignListFilter({ sort: "name", order: "asc" });
    expect(sort).toEqual({ name: 1 });
    const rows = await CampaignModel.find({ archived: { $ne: true } }).sort(sort).lean();
    expect(rows.map((r) => r.name)).toEqual(["November launch", "Trial ending reminder"]);
  });

  it("rejects invalid input", () => {
    expect(buildCampaignListFilter({ status: "bogus" }).error).toBe("Invalid status");
    expect(buildCampaignListFilter({ sort: "bogus" }).error).toBe("Invalid sort");
    expect(buildCampaignListFilter({ from: "not-a-date" }).error).toBe("Invalid from/to");
    expect(buildCampaignListFilter({ from: "2026-11-12", to: "2026-11-10" }).error).toBe(
      "Invalid from/to"
    );
  });
});
