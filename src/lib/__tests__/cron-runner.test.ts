/**
 * Cron runner tests — Phase 6.
 * Idempotency, overlap protection, stale-run reaping, failure recording.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import { runCronJob } from "@/lib/cron-runner";
import { CronRunModel } from "@/models/CronRun";

beforeAll(async () => {
  await setupTestDb();
  // The race test needs the unique index on idempotencyKey to exist.
  await CronRunModel.init();
});
afterAll(async () => {
  await teardownTestDb();
});
beforeEach(async () => {
  await clearDb();
});

describe("runCronJob", () => {
  it("records a successful run with stats", async () => {
    const result = await runCronJob(
      "test-job",
      async () => ({ status: "succeeded", stats: { items: 5 } }),
      { idempotencyKey: "test-job:k1", triggeredBy: "cron" }
    );
    expect(result.skipped).toBe(false);

    const run = await CronRunModel.findOne({ idempotencyKey: "test-job:k1" }).lean();
    expect(run?.status).toBe("succeeded");
    expect(run?.finishedAt).toBeDefined();
    expect(run?.durationMs).toBeGreaterThanOrEqual(0);
    const stats = run?.stats as unknown as Record<string, number> | Map<string, number>;
    const items = stats instanceof Map ? stats.get("items") : stats?.["items"];
    expect(items).toBe(5);
  });

  it("skips when a succeeded run already exists (idempotent)", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return { status: "succeeded" as const };
    };
    await runCronJob("test-job", fn, { idempotencyKey: "test-job:k2", triggeredBy: "cron" });
    const second = await runCronJob("test-job", fn, { idempotencyKey: "test-job:k2", triggeredBy: "cron" });
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("already-succeeded");
    expect(calls).toBe(1);
  });

  it("skips overlapping runs", async () => {
    // Simulate a run that is still in progress
    await CronRunModel.create({
      jobName: "test-job",
      idempotencyKey: "test-job:k3",
      status: "running",
      triggeredBy: "cron",
      startedAt: new Date(),
    });
    const result = await runCronJob(
      "test-job",
      async () => ({ status: "succeeded" as const }),
      { idempotencyKey: "test-job:k3", triggeredBy: "cron" }
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("overlap");
  });

  it("reaps stale running runs and reuses the row", async () => {
    await CronRunModel.create({
      jobName: "test-job",
      idempotencyKey: "test-job:k4",
      status: "running",
      triggeredBy: "cron",
      startedAt: new Date(Date.now() - 2 * 3600 * 1000), // 2h ago
    });
    const result = await runCronJob(
      "test-job",
      async () => ({ status: "succeeded" as const, stats: { ok: 1 } }),
      { idempotencyKey: "test-job:k4", triggeredBy: "cron", overlapTtlMs: 60 * 1000 }
    );
    expect(result.skipped).toBe(false);
    // The stale row is reused (unique index on idempotencyKey), not duplicated
    const runs = await CronRunModel.find({ idempotencyKey: "test-job:k4" }).lean();
    expect(runs.length).toBe(1);
    expect(runs[0]?.status).toBe("succeeded");
  });

  it("retries after a failure without a duplicate-key error", async () => {
    // Simulate a previous failed run with the same key
    await CronRunModel.create({
      jobName: "test-job",
      idempotencyKey: "test-job:k7",
      status: "failed",
      triggeredBy: "cron",
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
      finishedAt: new Date(Date.now() - 9 * 60 * 1000),
      error: "boom",
    });
    const result = await runCronJob(
      "test-job",
      async () => ({ status: "succeeded" as const }),
      { idempotencyKey: "test-job:k7", triggeredBy: "cron" }
    );
    expect(result.skipped).toBe(false);
    const runs = await CronRunModel.find({ idempotencyKey: "test-job:k7" }).lean();
    expect(runs.length).toBe(1);
    expect(runs[0]?.status).toBe("succeeded");
    expect(runs[0]?.error).toBeUndefined();
  });

  it("lets exactly one concurrent invocation through", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      // Hold the run briefly so the two invocations overlap for real
      await new Promise((r) => setTimeout(r, 50));
      return { status: "succeeded" as const };
    };
    const [a, b] = await Promise.all([
      runCronJob("test-job", fn, { idempotencyKey: "test-job:k8", triggeredBy: "cron" }),
      runCronJob("test-job", fn, { idempotencyKey: "test-job:k8", triggeredBy: "cron" }),
    ]);
    const proceeded = [a, b].filter((r) => !r.skipped);
    const skipped = [a, b].filter((r) => r.skipped);
    expect(proceeded.length).toBe(1);
    expect(skipped.length).toBe(1);
    expect(skipped[0]?.reason).toBe("overlap");
    expect(calls).toBe(1);
    const runs = await CronRunModel.find({ idempotencyKey: "test-job:k8" }).lean();
    expect(runs.length).toBe(1);
  });

  it("records failures with the error message", async () => {
    await expect(
      runCronJob(
        "test-job",
        async () => {
          throw new Error("boom");
        },
        { idempotencyKey: "test-job:k5", triggeredBy: "manual", triggeredByUserId: undefined }
      )
    ).rejects.toThrow("boom");

    const run = await CronRunModel.findOne({ idempotencyKey: "test-job:k5" }).lean();
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("boom");
    expect(run?.triggeredBy).toBe("manual");
  });

  it("records partial status", async () => {
    await runCronJob(
      "test-job",
      async () => ({ status: "partial" as const, stats: { failed: 2 }, error: "2 items failed" }),
      { idempotencyKey: "test-job:k6", triggeredBy: "cron" }
    );
    const run = await CronRunModel.findOne({ idempotencyKey: "test-job:k6" }).lean();
    expect(run?.status).toBe("partial");
    expect(run?.error).toBe("2 items failed");
  });
});
