/**
 * Cron job runner — idempotency, overlap protection, and run history.
 *
 * Every scheduled job goes through runCronJob():
 * - Idempotency: if a run with the same idempotencyKey already SUCCEEDED,
 *   the job is skipped (safe retries, safe double-scheduling).
 * - Overlap: if a run with the same key is still RUNNING and started less
 *   than `overlapTtlMs` ago, the new invocation is skipped. Stale "running"
 *   rows (crashed workers) are reaped and the row is reused.
 * - Claiming is atomic: exactly one concurrent invocation wins the row via
 *   findOneAndUpdate + the unique index on idempotencyKey. A duplicate-key
 *   error means a concurrent invocation claimed it first → skip as overlap.
 * - History: one row per idempotencyKey, reused across retries (failed/
 *   partial/stale rows are reset to "running" when claimed).
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { CronRunModel } from "@/models/CronRun";
import { logger } from "@/lib/logger";

export interface CronJobResult {
  /** "succeeded" | "partial" (some items failed) — "failed" is derived from throws. */
  status: "succeeded" | "partial";
  stats?: Record<string, number>;
  error?: string;
}

interface RunOptions {
  /** Idempotency key, e.g. `sync-stores:2026-10-16T23`. */
  idempotencyKey: string;
  triggeredBy: "cron" | "manual";
  triggeredByUserId?: string;
  /** Max age of a "running" row before it's considered stale. Default 55 min. */
  overlapTtlMs?: number;
}

export async function runCronJob(
  jobName: string,
  fn: () => Promise<CronJobResult>,
  opts: RunOptions
): Promise<{ skipped: boolean; reason?: string; runId?: string }> {
  await connectDB();
  const { idempotencyKey, triggeredBy, overlapTtlMs = 55 * 60 * 1000 } = opts;

  // Idempotency: never repeat a succeeded run for the same key.
  // (Succeeded is terminal for a key, so this read is race-safe.)
  const prior = await CronRunModel.findOne({ idempotencyKey }).lean();
  if (prior?.status === "succeeded") {
    logger.info("cron skipped — already succeeded", { jobName, idempotencyKey });
    return { skipped: true, reason: "already-succeeded" };
  }
  if (prior?.status === "running") {
    const ageMs = Date.now() - new Date(prior.startedAt).getTime();
    if (ageMs < overlapTtlMs) {
      logger.info("cron skipped — overlapping run in progress", { jobName, idempotencyKey });
      return { skipped: true, reason: "overlap" };
    }
    logger.info("cron reaping stale running run", { jobName, idempotencyKey });
  }

  // Atomic claim: reuse a failed/partial/stale row, or insert a new one.
  // The filter only matches claimable states, so two concurrent invocations
  // cannot both win — the loser either matches nothing (→ upsert → 11000)
  // or loses the insert race (→ 11000). Either way it skips as overlap.
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - overlapTtlMs);
  let runId: mongoose.Types.ObjectId;
  try {
    const claimed = await CronRunModel.findOneAndUpdate(
      {
        idempotencyKey,
        $or: [
          { status: { $in: ["failed", "partial"] } },
          { status: "running", startedAt: { $lt: staleCutoff } },
        ],
      },
      {
        $set: {
          jobName,
          status: "running",
          triggeredBy,
          ...(opts.triggeredByUserId && mongoose.Types.ObjectId.isValid(opts.triggeredByUserId)
            ? { triggeredByUserId: new mongoose.Types.ObjectId(opts.triggeredByUserId) }
            : {}),
          startedAt: now,
          stats: {},
        },
        $unset: { finishedAt: "", durationMs: "", error: "" },
      },
      { upsert: true, new: true }
    ).lean();
    if (!claimed) {
      // Should not happen with upsert:true; treat as overlap to stay safe.
      logger.warn("cron claim returned no document", { jobName, idempotencyKey });
      return { skipped: true, reason: "overlap" };
    }
    runId = claimed._id;
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      logger.info("cron skipped — concurrent claim won", { jobName, idempotencyKey });
      return { skipped: true, reason: "overlap" };
    }
    throw err;
  }

  const started = Date.now();
  try {
    const result = await fn();
    const finished = new Date();
    await CronRunModel.updateOne(
      { _id: runId },
      {
        $set: {
          status: result.status,
          finishedAt: finished,
          durationMs: Date.now() - started,
          stats: result.stats ?? {},
          ...(result.error ? { error: result.error.slice(0, 2000) } : {}),
        },
      }
    );
    logger.info("cron finished", { jobName, status: result.status, stats: result.stats });
    return { skipped: false, runId: runId.toString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await CronRunModel.updateOne(
      { _id: runId },
      {
        $set: {
          status: "failed",
          finishedAt: new Date(),
          durationMs: Date.now() - started,
          error: message.slice(0, 2000),
        },
      }
    );
    logger.error("cron failed", err instanceof Error ? err : new Error(message), { jobName });
    throw err;
  }
}

/** Serialize a CronRun lean doc for API responses (Map -> plain object). */
export function serializeCronRun(run: {
  _id: unknown;
  jobName: string;
  status: string;
  triggeredBy: string;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  stats?: Map<string, number> | Record<string, number>;
  error?: string;
}) {
  const stats = run.stats instanceof Map
    ? Object.fromEntries(run.stats)
    : (run.stats ?? {});
  return {
    id: String(run._id),
    jobName: run.jobName,
    status: run.status,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : run.startedAt,
    finishedAt: run.finishedAt instanceof Date ? run.finishedAt.toISOString() : run.finishedAt,
    durationMs: run.durationMs,
    stats,
    error: run.error,
  };
}
