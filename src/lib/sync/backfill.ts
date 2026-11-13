/**
 * Ad-spend sync backfill — the runner (server-only).
 *
 * Fills the older gap for one ad account, newest chunk first, and
 * persists progress on the account (`backfillThrough`: the oldest
 * date with contiguous coverage). Once coverage reaches 365 days,
 * later runs are incremental only — the whole 365 days are never
 * re-pulled. Best effort by design: a chunk failure stops the
 * backfill (the error is logged and returned) but never fails the
 * sync itself — the recent incremental data was already fetched.
 *
 * The pure window math lives in ./ad-spend-days (client-safe) and is
 * re-exported here so sync libs and tests keep a single import.
 */
import AdAccountModel from "@/models/AdAccount";
import { logger, toLogError } from "@/lib/logger";
import { computeBackfillGap, splitDateRange } from "./ad-spend-days";
import type { DateChunk } from "./ad-spend-days";

export {
  AD_SPEND_DAY_OPTIONS,
  BACKFILL_CHUNK_DAYS,
  BACKFILL_REPULL_DAYS,
  DAY_MS,
  DEFAULT_LOOKBACK_DAYS,
  MAX_BACKFILL_DAYS,
  computeBackfillGap,
  computeIncrementalWindow,
  floorDay,
  parseAdSpendDays,
  splitDateRange,
} from "./ad-spend-days";
export type { AdSpendDays, BackfillGap, DateChunk, SyncWindow, SyncWindowMode } from "./ad-spend-days";

export interface BackfillResult {
  /** Chunks fetched this run (0 when coverage was already complete). */
  chunksCompleted: number;
  /** Oldest date with contiguous coverage after this run (null = never). */
  backfilledThrough: Date | null;
  /** Set when a chunk failed: backfill stopped, the error is recorded. */
  error?: string;
}

/**
 * Fill the older gap for one ad account, newest chunk first. Each
 * completed chunk persists the tracker immediately, so a later run
 * resumes from it.
 */
export async function runAdSpendBackfill(input: {
  adAccountId: string;
  coverageStart: Date;
  fetchChunk: (chunk: DateChunk) => Promise<void>;
  now?: Date;
}): Promise<BackfillResult> {
  const account = await AdAccountModel.findById(input.adAccountId)
    .select("backfillThrough")
    .lean();
  const backfilledThrough = account?.backfillThrough ?? null;
  const gap = computeBackfillGap({
    now: input.now,
    backfillThrough: backfilledThrough,
    coverageStart: input.coverageStart,
  });
  if (!gap) return { chunksCompleted: 0, backfilledThrough };

  let completed = 0;
  let through: Date | null = backfilledThrough;
  for (const chunk of splitDateRange(gap.startDate, gap.endDate)) {
    try {
      await input.fetchChunk(chunk);
    } catch (err) {
      const message =
        err instanceof Error ? err.message.slice(0, 200) : "Backfill chunk failed";
      logger.error("ad-spend backfill chunk failed", {
        ...toLogError(err),
        adAccountId: input.adAccountId,
        chunkStart: chunk.startDate.toISOString().slice(0, 10),
      });
      return { chunksCompleted: completed, backfilledThrough: through, error: message };
    }
    through = chunk.startDate;
    await AdAccountModel.findByIdAndUpdate(input.adAccountId, {
      backfillThrough: through,
    });
    completed++;
  }
  return { chunksCompleted: completed, backfilledThrough: through };
}
