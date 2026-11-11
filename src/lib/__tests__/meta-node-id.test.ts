/**
 * Meta ad account node-id regression tests.
 *
 * AdAccount.accountId is stored exactly as Meta returns it from
 * /me/adaccounts, WITH the "act_" prefix. The sync used to build
 * `act_${accountId}`, producing the nonexistent node "act_act_…" and
 * the Graph error "Unsupported get request. Object with ID 'act_act_…'
 * does not exist" on every sync. These tests pin the live (non-mock)
 * path to request "act_<id>" for both stored forms.
 *
 * Kept in its own file: the in-memory MongoDB setup/teardown can only
 * run once per vitest worker, and ads-mock.test.ts already owns a cycle.
 */
import "./setup-env";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import { syncMetaAdSpend } from "@/lib/sync/meta-ads";
import AdAccountModel from "@/models/AdAccount";
import { encrypt } from "@/lib/encryption";

describe("syncMetaAdSpend — ad account node id (live path)", () => {
  const teamId = new mongoose.Types.ObjectId();
  const storeId = new mongoose.Types.ObjectId();
  const prevMock = process.env.AD_MOCK_MODE;
  const today = new Date().toISOString().slice(0, 10);
  let requestedUrls: string[] = [];

  const insightsRow = {
    campaign_id: "camp_1",
    campaign_name: "Test Campaign",
    date_start: today,
    spend: "12.34",
    impressions: "100",
    clicks: "5",
    actions: [{ action_type: "purchase", value: "2" }],
    action_values: [{ action_type: "purchase", value: "50.00" }],
  };

  const stubResponse = (payload: unknown) => ({
    ok: true,
    status: 200,
    headers: { get: () => null as string | null },
    json: async () => payload,
  });

  beforeAll(async () => {
    await setupTestDb();
    process.env.AD_MOCK_MODE = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        requestedUrls.push(u);
        if (u.includes("fields=timezone_name")) {
          return stubResponse({ timezone_name: "UTC" });
        }
        return stubResponse({ data: [insightsRow] });
      })
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (prevMock === undefined) delete process.env.AD_MOCK_MODE;
    else process.env.AD_MOCK_MODE = prevMock;
    await teardownTestDb();
  });

  beforeEach(async () => {
    requestedUrls = [];
    await clearDb();
  });

  async function createLiveAccount(accountId: string) {
    return AdAccountModel.create({
      storeId,
      teamId,
      platform: "meta",
      accountId,
      accountName: `Live ${accountId}`,
      currency: "USD",
      accessToken: encrypt("live-token"),
      syncStatus: "idle",
      isActive: true,
    });
  }

  it("builds act_<id> (not act_act_<id>) when the stored id already has the prefix", async () => {
    const acct = await createLiveAccount("act_123");
    const result = await syncMetaAdSpend(acct._id.toString(), teamId.toString(), {});
    expect(result.synced).toBe(1);
    expect(requestedUrls.some((u) => u.includes("act_act_"))).toBe(false);
    expect(requestedUrls.some((u) => u.includes("/act_123/insights"))).toBe(true);
    expect(requestedUrls.some((u) => u.includes("/act_123?fields=timezone_name"))).toBe(true);

    const updated = await AdAccountModel.findById(acct._id).lean();
    expect(updated?.syncStatus).toBe("idle");
    expect(updated?.lastSyncAt).toBeDefined();
  });

  it("builds act_<id> when the stored id is bare", async () => {
    const acct = await createLiveAccount("456");
    const result = await syncMetaAdSpend(acct._id.toString(), teamId.toString(), {});
    expect(result.synced).toBe(1);
    expect(requestedUrls.some((u) => u.includes("act_act_"))).toBe(false);
    expect(requestedUrls.some((u) => u.includes("/act_456/insights"))).toBe(true);
  });
});
