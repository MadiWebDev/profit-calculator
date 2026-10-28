import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import ApiKeyModel from "@/models/ApiKey";
import { jobPurgeDeletedAccounts, jobApiKeyReset } from "@/lib/jobs";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe("cron jobs: purge + apikey-reset", () => {
  it("purges only accounts past the grace period, and resets api key counters", async () => {
    const team = await TeamModel.create({
      name: "Purge Co",
      slug: `purge-co-${Date.now()}`,
      ownerId: new mongoose.Types.ObjectId(),
    });
    const past = await UserModel.create({
      email: "past@example.com",
      name: "Past",
      teamId: team._id,
      plan: "free",
      deletionScheduledAt: new Date(Date.now() - 1000),
    });
    const futureTeam = await TeamModel.create({
      name: "Keep Co",
      slug: `keep-co-${Date.now()}`,
      ownerId: new mongoose.Types.ObjectId(),
    });
    const future = await UserModel.create({
      email: "future@example.com",
      name: "Future",
      teamId: futureTeam._id,
      plan: "free",
      deletionScheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const res = await jobPurgeDeletedAccounts();
    expect(res.status).toBe("succeeded");
    expect(await UserModel.findById(past._id)).toBeNull();
    expect(await TeamModel.findById(team._id)).toBeNull();
    expect(await UserModel.findById(future._id)).not.toBeNull();
    expect(await TeamModel.findById(futureTeam._id)).not.toBeNull();

    await ApiKeyModel.create({
      teamId: futureTeam._id,
      createdBy: future._id,
      name: "test key",
      keyHash: "hash-abc-123",
      keyPrefix: "gpc_test",
      recentUseCount: 7,
    });
    const reset = await jobApiKeyReset();
    expect(reset.status).toBe("succeeded");
    const key = await ApiKeyModel.findOne({ keyHash: "hash-abc-123" }).lean();
    expect(key?.recentUseCount).toBe(0);
  });
});
