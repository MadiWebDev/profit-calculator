import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import {
  getEffectivePlan,
  assertCan,
  getUsage,
  EntitlementError,
  type EntitlementAction,
} from "@/lib/entitlements";
import { PLAN_LIMITS, type PlanId } from "@/lib/plans";
import TeamModel from "@/models/Team";
import SubscriptionModel from "@/models/Subscription";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";

beforeAll(async () => {
  await setupTestDb();
}, 60000);
afterAll(async () => {
  await teardownTestDb();
});
beforeEach(async () => {
  await clearDb();
});

async function makeTeam(overrides: Record<string, unknown> = {}) {
  const ownerId = new mongoose.Types.ObjectId();
  return TeamModel.create({
    name: "Test Team",
    slug: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    members: [{ userId: ownerId, role: "owner", status: "active", invitedAt: new Date() }],
    plan: "free",
    trialEndsAt: new Date(Date.now() - 86400000), // expired by default
    ...overrides,
  });
}

async function makeSub(teamId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return SubscriptionModel.create({
    teamId,
    gateway: "paddle",
    externalId: `sub_${Math.random().toString(36).slice(2, 10)}`,
    customerId: "cus_test",
    plan: "growth",
    interval: "monthly",
    status: "active",
    currentPeriodStart: new Date(Date.now() - 86400000),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    priceId: "pri_test",
    ...overrides,
  });
}

/**
 * Put a team on `plan`. "free" means no subscription (the real free state).
 */
async function withPlan(teamId: mongoose.Types.ObjectId, plan: PlanId, status = "active") {
  if (plan === "free") return null;
  return makeSub(teamId, { plan, status });
}

describe("getEffectivePlan", () => {
  it("active subscription → subscription plan", async () => {
    const team = await makeTeam();
    await makeSub(team._id, { plan: "pro", status: "active" });
    const eff = await getEffectivePlan(team._id.toString());
    expect(eff.plan).toBe("pro");
    expect(eff.source).toBe("subscription");
  });

  it("trialing subscription → subscription plan", async () => {
    const team = await makeTeam();
    await makeSub(team._id, { plan: "starter", status: "trialing" });
    expect((await getEffectivePlan(team._id.toString())).plan).toBe("starter");
  });

  it("past_due within 7-day grace → plan (grace)", async () => {
    const team = await makeTeam();
    await makeSub(team._id, { plan: "growth", status: "past_due" }); // updatedAt = now
    const eff = await getEffectivePlan(team._id.toString());
    expect(eff.plan).toBe("growth");
    expect(eff.source).toBe("grace");
  });

  it("past_due beyond grace → free", async () => {
    const team = await makeTeam();
    const sub = await makeSub(team._id, { plan: "growth", status: "past_due" });
    // Simulate the status change 8 days ago (timestamps:false so Mongoose
    // doesn't overwrite updatedAt with "now")
    await SubscriptionModel.findByIdAndUpdate(
      sub._id,
      { $set: { updatedAt: new Date(Date.now() - 8 * 86400000) } },
      { timestamps: false }
    );
    const eff = await getEffectivePlan(team._id.toString());
    expect(eff.plan).toBe("free");
  });

  it("cancelled with future period end → plan until period end", async () => {
    const team = await makeTeam();
    await makeSub(team._id, {
      plan: "pro",
      status: "cancelled",
      currentPeriodEnd: new Date(Date.now() + 5 * 86400000),
    });
    expect((await getEffectivePlan(team._id.toString())).plan).toBe("pro");
  });

  it("cancelled with past period end → free", async () => {
    const team = await makeTeam();
    await makeSub(team._id, {
      plan: "pro",
      status: "cancelled",
      currentPeriodEnd: new Date(Date.now() - 86400000),
    });
    expect((await getEffectivePlan(team._id.toString())).plan).toBe("free");
  });

  it("paused → free", async () => {
    const team = await makeTeam();
    await makeSub(team._id, { plan: "pro", status: "paused" });
    expect((await getEffectivePlan(team._id.toString())).plan).toBe("free");
  });

  it("no subscription + active trial → growth limits", async () => {
    const team = await makeTeam({ trialEndsAt: new Date(Date.now() + 3 * 86400000) });
    const eff = await getEffectivePlan(team._id.toString());
    expect(eff.plan).toBe("growth");
    expect(eff.source).toBe("trial");
  });

  it("no subscription + expired trial → free", async () => {
    const team = await makeTeam({ trialEndsAt: new Date(Date.now() - 86400000) });
    const eff = await getEffectivePlan(team._id.toString());
    expect(eff.plan).toBe("free");
  });
});

describe("assertCan — plan × limit matrix", () => {
  const plans: PlanId[] = ["free", "starter", "growth", "pro"];

  // Numeric limits to matrix-test: action → plan-limit key → baseline usage
  // (team.invite baselines at 1 because the owner is already a member)
  const matrix: Array<{ action: EntitlementAction; key: keyof typeof PLAN_LIMITS.free; baseline: number }> = [
    { action: "stores.connect", key: "stores", baseline: 0 },
    { action: "adplatforms.connect", key: "adPlatforms", baseline: 0 },
    { action: "team.invite", key: "teamMembers", baseline: 1 },
  ];

  for (const { action, key, baseline } of matrix) {
    for (const plan of plans) {
      const limit = PLAN_LIMITS[plan][key] as number;
      if (limit === -1) {
        it(`${action} @ ${plan}: unlimited (-1) always allows`, async () => {
          const team = await makeTeam();
          await withPlan(team._id, plan);
          // Even a huge count passes when unlimited
          const eff = await assertCan(team._id.toString(), action, { count: 10_000 });
          expect(eff.plan).toBe(plan);
        });
        continue;
      }

      it(`${action} @ ${plan}: allows below limit, blocks at/above limit`, async () => {
        // --- below limit (limit-1 total) → allowed — only when reachable
        if (limit - 1 >= baseline) {
          const team = await makeTeam();
          await withPlan(team._id, plan);
          await seedUsage(team._id, action, limit - 1 - baseline);
          await assertCan(team._id.toString(), action, { count: 1 }); // should not throw
          await clearDb();
        }

        // --- at limit → blocked
        {
          const team = await makeTeam();
          await withPlan(team._id, plan);
          await seedUsage(team._id, action, limit - baseline);
          try {
            await assertCan(team._id.toString(), action, { count: 1 });
            expect.unreachable("should have thrown EntitlementError");
          } catch (e) {
            const err = e as EntitlementError;
            expect(err.details.code).toBe("PLAN_LIMIT");
            expect(err.details.limit).toBe(limit);
            expect(err.details.used).toBe(limit);
          }
          await clearDb();
        }

        // --- above limit → blocked
        {
          const team = await makeTeam();
          await withPlan(team._id, plan);
          await seedUsage(team._id, action, limit + 1 - baseline);
          await expect(assertCan(team._id.toString(), action, { count: 1 })).rejects.toThrow(EntitlementError);
          await clearDb();
        }
      });
    }
  }

  it("orders.import: blocks when monthly orders would exceed the cap", async () => {
    const team = await makeTeam();
    await makeSub(team._id, { plan: "starter", status: "active" }); // 100 orders/mo
    await seedOrders(team._id, 100);
    await expect(assertCan(team._id.toString(), "orders.import", { count: 1 })).rejects.toThrow(EntitlementError);
    // But 99 + 1 fits
    await clearDb();
    const team2 = await makeTeam();
    await withPlan(team2._id, "starter");
    await seedOrders(team2._id, 99);
    await assertCan(team2._id.toString(), "orders.import", { count: 1 });
  });

  it("ai.insights: boolean gate — free blocked, growth allowed", async () => {
    const freeTeam = await makeTeam();
    await withPlan(freeTeam._id, "free");
    await expect(assertCan(freeTeam._id.toString(), "ai.insights")).rejects.toThrow(EntitlementError);

    await clearDb();
    const growthTeam = await makeTeam();
    await withPlan(growthTeam._id, "growth");
    await assertCan(growthTeam._id.toString(), "ai.insights");
  });

  it("api.access: boolean gate — growth blocked, pro allowed", async () => {
    const growthTeam = await makeTeam();
    await withPlan(growthTeam._id, "growth");
    await expect(assertCan(growthTeam._id.toString(), "api.access")).rejects.toThrow(EntitlementError);

    await clearDb();
    const proTeam = await makeTeam();
    await withPlan(proTeam._id, "pro");
    await assertCan(proTeam._id.toString(), "api.access");
  });

  it("upgradeTo suggests the next plan with a higher limit", async () => {
    const team = await makeTeam();
    await withPlan(team._id, "free"); // free: 1 store
    await seedUsage(team._id, "stores.connect", 1);
    try {
      await assertCan(team._id.toString(), "stores.connect");
      expect.unreachable();
    } catch (e) {
      expect((e as EntitlementError).details.upgradeTo).toBe("growth"); // starter also has 1
    }
  });
});

describe("getUsage", () => {
  it("counts monthly orders, stores, platforms and active members", async () => {
    const team = await makeTeam();
    await seedOrders(team._id, 3);
    await StoreModel.create({ teamId: team._id, name: "S1", platform: "shopify", isActive: true });
    await StoreModel.create({ teamId: team._id, name: "S2", platform: "csv_manual", isActive: false });

    const usage = await getUsage(team._id.toString());
    expect(usage.ordersThisMonth).toBe(3);
    expect(usage.stores).toBe(2); // seedOrders' store + S1 (S2 is inactive)
    expect(usage.teamMembers).toBe(1);
  });
});

// ─── helpers ────────────────────────────────────────────────────────────────

async function seedUsage(teamId: mongoose.Types.ObjectId, action: EntitlementAction, n: number) {
  if (action === "stores.connect") {
    for (let i = 0; i < n; i++) {
      await StoreModel.create({ teamId, name: `S${i}`, platform: "shopify", isActive: true });
    }
  } else if (action === "adplatforms.connect") {
    const { default: AdAccountModel } = await import("@/models/AdAccount");
    const store = await StoreModel.create({ teamId, name: "AdStore", platform: "shopify", isActive: true });
    for (let i = 0; i < n; i++) {
      await AdAccountModel.create({ teamId, storeId: store._id, platform: "meta", accountId: `act_${i}`, accessToken: "enc", isActive: true });
    }
  } else if (action === "team.invite") {
    const team = await TeamModel.findById(teamId);
    if (team) {
      // team starts with 1 active member (the owner); add n more
      for (let i = 0; i < n; i++) {
        team.members.push({
          userId: new mongoose.Types.ObjectId(),
          role: "member",
          status: "active",
          invitedAt: new Date(),
        } as never);
      }
      await team.save();
    }
  }
}

async function seedOrders(teamId: mongoose.Types.ObjectId, n: number) {
  const store = await StoreModel.create({ teamId, name: "S", platform: "csv_manual", isActive: true });
  const docs = [];
  for (let i = 0; i < n; i++) {
    docs.push({
      teamId,
      storeId: store._id,
      externalId: `ord-${i}`,
      orderDate: new Date(),
      currency: "USD",
      grossRevenue: 10,
    });
  }
  await OrderModel.insertMany(docs);
}
