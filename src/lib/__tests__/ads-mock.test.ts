/**
 * Ad platform mock-mode tests — Phase 7.
 * Deterministic fixtures + idempotent mock sync (memory MongoDB).
 */
import "./setup-env";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import { isAdMockMode, mockSpendRows } from "@/lib/ads/mock";
import { syncMetaAdSpend } from "@/lib/sync/meta-ads";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { encrypt } from "@/lib/encryption";

describe("ad mock fixtures", () => {
  it("isAdMockMode reflects the env var", () => {
    const prev = process.env.AD_MOCK_MODE;
    process.env.AD_MOCK_MODE = "true";
    expect(isAdMockMode()).toBe(true);
    process.env.AD_MOCK_MODE = "false";
    expect(isAdMockMode()).toBe(false);
    if (prev === undefined) delete process.env.AD_MOCK_MODE;
    else process.env.AD_MOCK_MODE = prev;
  });

  it("mockSpendRows is deterministic per account", () => {
    const a = mockSpendRows("acct-1");
    const b = mockSpendRows("acct-1");
    const c = mockSpendRows("acct-2");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.length).toBe(60); // 30 days × 2 campaigns
    for (const row of a) {
      expect(row.spend).toBeGreaterThan(0);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("syncMetaAdSpend — mock mode", () => {
  const prevMock = process.env.AD_MOCK_MODE;
  const teamId = new mongoose.Types.ObjectId();
  const storeId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await setupTestDb();
    process.env.AD_MOCK_MODE = "true";
  });
  afterAll(async () => {
    if (prevMock === undefined) delete process.env.AD_MOCK_MODE;
    else process.env.AD_MOCK_MODE = prevMock;
    await teardownTestDb();
  });
  beforeEach(async () => {
    await clearDb();
  });

  async function createAccount() {
    return AdAccountModel.create({
      storeId,
      teamId,
      platform: "meta",
      accountId: "act_123",
      accountName: "Mock Meta",
      currency: "USD",
      accessToken: encrypt("mock-token"),
      syncStatus: "idle",
      isActive: true,
    });
  }

  it("backfills 365 days on first sync and is idempotent afterwards", async () => {
    const acct = await createAccount();
    // First sync: incremental window (last 30 days) + backfill of the
    // older gap, newest chunk first. Distinct stored rows cover 366
    // calendar days (365 days ago .. today) x 2 campaigns.
    const r1 = await syncMetaAdSpend(acct._id.toString(), teamId.toString(), {});
    expect(r1.backfill?.chunksCompleted).toBe(12);
    expect(r1.backfill?.error).toBeUndefined();
    expect(r1.synced).toBeGreaterThan(700);

    const count1 = await AdSpendDailyModel.countDocuments({ adAccountId: acct._id });
    expect(count1).toBe(732);

    // Second run: coverage already reaches 365 days, so no backfill —
    // only the incremental tail (lastSyncAt − 3 days) is re-fetched,
    // and upserts stay idempotent (no duplicates).
    const r2 = await syncMetaAdSpend(acct._id.toString(), teamId.toString(), {});
    expect(r2.backfill?.chunksCompleted).toBe(0);
    expect(r2.synced).toBeLessThanOrEqual(10);
    const count2 = await AdSpendDailyModel.countDocuments({ adAccountId: acct._id });
    expect(count2).toBe(732);

    const updated = await AdAccountModel.findById(acct._id).lean();
    expect(updated?.syncStatus).toBe("idle");
    expect(updated?.lastSyncAt).toBeDefined();
    expect(updated?.backfillThrough).toBeDefined();
  });

  it("throws for unknown account", async () => {
    await expect(
      syncMetaAdSpend(new mongoose.Types.ObjectId().toString(), teamId.toString(), {})
    ).rejects.toThrow("Ad account not found");
  });

  it("throws for invalid ids", async () => {
    await expect(syncMetaAdSpend("nope", teamId.toString(), {})).rejects.toThrow();
  });
});
