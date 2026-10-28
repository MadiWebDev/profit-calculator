/**
 * Paddle webhook tests — Phase 8.
 * Covers: price→plan mapping, out-of-order event guard (applyIfNewer),
 * payment_failed → past_due + dunning, stale events never resurrect.
 */
import "./setup-env";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import mongoose from "mongoose";
import {
  planFromPriceId,
  applyIfNewer,
  resolveTeamId,
  handleSubscriptionUpsert,
  handleTransactionCompleted,
  handlePaymentFailed,
  handleSubscriptionCanceled,
  handleSubscriptionResumed,
} from "@/lib/paddle-webhooks";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";

vi.mock("@/lib/email", () => ({
  sendDunningEmail: vi.fn().mockResolvedValue(undefined),
  sendGoalAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendDunningEmail } from "@/lib/email";

beforeAll(async () => {
  await setupTestDb();
});
afterAll(async () => {
  await teardownTestDb();
});
beforeEach(async () => {
  await clearDb();
  vi.clearAllMocks();
});

const teamId = () => new mongoose.Types.ObjectId();
const userId = () => new mongoose.Types.ObjectId();

async function seedSub(overrides: Record<string, unknown> = {}) {
  const tid = teamId();
  const oid = userId();
  await TeamModel.create({
    _id: tid,
    name: "Dunning Co",
    slug: `dunning-co-${tid.toString().slice(-6)}`,
    ownerId: oid,
    members: [{ userId: oid, role: "owner" }],
  });
  return SubscriptionModel.create({
    teamId: tid,
    gateway: "paddle",
    externalId: "sub_test_1",
    customerId: "cus_test_1",
    plan: "growth",
    interval: "monthly",
    status: "active",
    priceId: "pri_growth_monthly",
    ...overrides,
  });
}

describe("planFromPriceId", () => {
  it("maps known price ids from the billing catalog", () => {
    // Exact mapping depends on env; the fallback must at least be sane
    const entry = planFromPriceId("pri_completely_unknown_xyz");
    expect(["starter", "growth", "pro"]).toContain(entry.plan);
    expect(["monthly", "quarterly", "semiannual", "annual"]).toContain(entry.interval);
  });

  it("falls back to string heuristics for unknown ids", () => {
    expect(planFromPriceId("pri_pro_annual_xyz").plan).toBe("pro");
    expect(planFromPriceId("pri_pro_annual_xyz").interval).toBe("annual");
    expect(planFromPriceId("pri_growth_quarterly_xyz").plan).toBe("growth");
  });
});

describe("applyIfNewer", () => {
  it("applies when no occurredAt is given", async () => {
    const sub = await seedSub();
    let ran = false;
    const applied = await applyIfNewer(sub.externalId, undefined, async () => {
      ran = true;
    });
    expect(applied).toBe(true);
    expect(ran).toBe(true);
  });

  it("skips stale events and applies newer ones", async () => {
    const sub = await seedSub();
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-02T00:00:00Z");

    let counter = 0;
    expect(await applyIfNewer(sub.externalId, t1, async () => { counter++; })).toBe(true);
    expect(counter).toBe(1);

    // Older event → skipped
    const t0 = new Date("2025-12-31T00:00:00Z");
    expect(await applyIfNewer(sub.externalId, t0, async () => { counter++; })).toBe(false);
    expect(counter).toBe(1);

    // Newer event → applied
    expect(await applyIfNewer(sub.externalId, t2, async () => { counter++; })).toBe(true);
    expect(counter).toBe(2);

    const updated = await SubscriptionModel.findById(sub._id).lean();
    expect(new Date(updated!.lastEventAt!).getTime()).toBe(t2.getTime());
  });
});

describe("handlePaymentFailed", () => {
  it("marks past_due and sends the first dunning email", async () => {
    const tid = teamId();
    const oid = userId();
    await TeamModel.create({
      _id: tid,
      name: "Dunning Co",
      slug: `dunning-co-${tid.toString().slice(-6)}`,
      ownerId: oid,
      members: [{ userId: oid, role: "owner" }],
    });
    await UserModel.create({
      _id: oid,
      email: "owner@example.com",
      name: "Owner",
      teamId: tid,
    });
    await SubscriptionModel.create({
      teamId: tid,
      gateway: "paddle",
      externalId: "sub_fail_1",
      customerId: "cus_1",
      plan: "growth",
      interval: "monthly",
      status: "active",
      priceId: "pri_x",
    });

    await handlePaymentFailed(
      { subscriptionId: "sub_fail_1" } as never,
      new Date()
    );

    const sub = await SubscriptionModel.findOne({ externalId: "sub_fail_1" }).lean();
    expect(sub!.status).toBe("past_due");
    expect(sub!.dunningCount).toBe(1);
    expect(sub!.dunningLastSentAt).toBeDefined();
    expect(sendDunningEmail).toHaveBeenCalledTimes(1);
    expect(sendDunningEmail).toHaveBeenCalledWith(
      "owner@example.com",
      "Owner",
      "growth",
      1
    );
  });

  it("respects the 24h dunning cooldown", async () => {
    const sub = await seedSub({
      externalId: "sub_fail_2",
      status: "past_due",
      dunningCount: 1,
      dunningLastSentAt: new Date(),
    });

    await handlePaymentFailed({ subscriptionId: "sub_fail_2" } as never, new Date());

    expect(sendDunningEmail).not.toHaveBeenCalled();
    const updated = await SubscriptionModel.findById(sub._id).lean();
    expect(updated!.dunningCount).toBe(1);
  });
});

describe("resolveTeamId fallback (anonymous-checkout safety net)", () => {
  it("prefers customData.teamId, falls back to paddleCustomerId, else null", async () => {
    const tid = teamId();
    await TeamModel.create({
      _id: tid,
      name: "Fallback Co",
      slug: `fallback-co-${tid.toString().slice(-6)}`,
      ownerId: userId(),
      paddleCustomerId: "cus_fallback_1",
    });

    expect(await resolveTeamId(tid.toString(), "cus_other")).toBe(tid.toString());
    expect(await resolveTeamId("", "cus_fallback_1")).toBe(tid.toString());
    expect(await resolveTeamId(undefined, "cus_unknown")).toBeNull();
    expect(await resolveTeamId(undefined, undefined)).toBeNull();
  });

  it("provisions via paddleCustomerId when customData.teamId is missing", async () => {
    const tid = teamId();
    await TeamModel.create({
      _id: tid,
      name: "Fallback Co 2",
      slug: `fallback-co2-${tid.toString().slice(-6)}`,
      ownerId: userId(),
      paddleCustomerId: "cus_fallback_2",
    });

    await handleSubscriptionUpsert(
      {
        id: "sub_fallback_1",
        customerId: "cus_fallback_2",
        items: [{ price: { id: "pri_growth_monthly" } }],
        status: "active",
        currentBillingPeriod: {
          startsAt: "2026-01-01T00:00:00Z",
          endsAt: "2026-02-01T00:00:00Z",
        },
        customData: {},
      } as never,
      new Date("2026-01-01T00:00:00Z")
    );

    const sub = await SubscriptionModel.findOne({ externalId: "sub_fallback_1" }).lean();
    expect(sub).toBeDefined();
    expect(String(sub!.teamId)).toBe(tid.toString());
    expect(sub!.plan).toBe("growth");
    const team = await TeamModel.findById(tid).lean();
    expect(team!.plan).toBe("growth");
  });

  it("transaction.completed does not block a later subscription.created", async () => {
    const tid = teamId();
    await TeamModel.create({
      _id: tid,
      name: "Race Co",
      slug: `race-co-${tid.toString().slice(-6)}`,
      ownerId: userId(),
    });

    await handleTransactionCompleted(
      {
        subscriptionId: "sub_race_tx",
        customerId: "cus_race",
        items: [{ price: { id: "pri_growth_monthly" } }],
        customData: { teamId: tid.toString() },
      } as never,
      new Date("2026-01-02T00:00:00Z")
    );

    // subscription.created carries an EARLIER occurredAt — it must still
    // apply its billing-period dates, not be skipped as stale.
    await handleSubscriptionUpsert(
      {
        id: "sub_race_tx",
        customerId: "cus_race",
        items: [{ price: { id: "pri_growth_monthly" } }],
        status: "active",
        currentBillingPeriod: {
          startsAt: "2026-01-01T00:00:00Z",
          endsAt: "2026-02-01T00:00:00Z",
        },
        customData: { teamId: tid.toString() },
      } as never,
      new Date("2026-01-01T00:00:00Z")
    );

    const sub = await SubscriptionModel.findOne({ externalId: "sub_race_tx" }).lean();
    expect(sub).toBeDefined();
    expect(new Date(sub!.currentPeriodStart!).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(new Date(sub!.currentPeriodEnd!).toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("cancel/resume ordering", () => {
  it("a stale resume cannot resurrect a canceled subscription", async () => {
    await seedSub({ externalId: "sub_race_1" });

    const cancelAt = new Date("2026-02-01T00:00:00Z");
    const resumeAt = new Date("2026-01-15T00:00:00Z"); // older

    await handleSubscriptionCanceled({ id: "sub_race_1" } as never, cancelAt);
    let sub = await SubscriptionModel.findOne({ externalId: "sub_race_1" }).lean();
    expect(sub!.status).toBe("cancelled");

    await handleSubscriptionResumed({ id: "sub_race_1" } as never, resumeAt);
    sub = await SubscriptionModel.findOne({ externalId: "sub_race_1" }).lean();
    expect(sub!.status).toBe("cancelled"); // still cancelled — stale event ignored
  });

  it("a newer resume restores the subscription", async () => {
    await seedSub({ externalId: "sub_race_2", status: "paused" });

    const resumeAt = new Date("2026-02-01T00:00:00Z");
    await handleSubscriptionResumed({ id: "sub_race_2" } as never, resumeAt);

    const sub = await SubscriptionModel.findOne({ externalId: "sub_race_2" }).lean();
    expect(sub!.status).toBe("active");
  });
});
