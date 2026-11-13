/**
 * Ad-spend date ranges — PURE helpers (no imports).
 *
 * Client-safe: the Ad Spend page's client component imports the range
 * options from here. Nothing in this file may import a model, the
 * logger, or any other server-only module — that would pull mongoose
 * into the client bundle and break the production build.
 *
 * The Ad Spend page offers the last 30 / 60 / 90 / 120 / 150 / 180 /
 * 365 days. The page only ever reads stored AdSpendDaily rows, so the
 * ranges are only honest if the syncs actually fetch that far back.
 * Historically every sync lib pulled only the last 30 days; the
 * backfill runner (src/lib/sync/backfill.ts) closes that gap.
 *
 * How a sync run works now:
 * 1. Incremental window — the recent tail (lastSyncAt − 3 days → now,
 *    or the last 30 days on a first sync). This is what keeps today's
 *    numbers fresh, including Meta's delayed-reporting corrections.
 * 2. Backfill gap — the older range from 365 days ago up to the oldest
 *    date with contiguous stored coverage. Fetched in ≤30-day chunks,
 *    newest first, so a run that dies halfway resumes where it left
 *    off instead of starting over.
 *
 * 30-day chunks: every provider already pulls a 30-day window in one
 * request today, so 30 days is the safe common denominator — no
 * provider-specific range-limit research needed. Consecutive chunks
 * share their boundary day (fetched twice); upserts are idempotent,
 * so the overlap is harmless and guarantees no day is skipped.
 */

export const DAY_MS = 864e5;

/** The date ranges the Ad Spend page offers. */
export const AD_SPEND_DAY_OPTIONS = [30, 60, 90, 120, 150, 180, 365] as const;
export type AdSpendDays = (typeof AD_SPEND_DAY_OPTIONS)[number];

/** How far back a sync ever backfills. Matches the longest page range. */
export const MAX_BACKFILL_DAYS = 365;
/** One provider request never covers more than this many days. */
export const BACKFILL_CHUNK_DAYS = 30;
/** Incremental window re-pulls this many days before the last sync. */
export const BACKFILL_REPULL_DAYS = 3;
/** Default lookback on a first sync (no lastSyncAt yet). */
export const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * Validate the `?days=` page param. Only the offered ranges are
 * accepted; anything else (missing, garbage, out-of-range) falls back
 * to 30 so a bad URL can never 500 or render an empty page.
 */
export function parseAdSpendDays(value: string | null | undefined): AdSpendDays {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return (AD_SPEND_DAY_OPTIONS as readonly number[]).includes(n) ? (n as AdSpendDays) : 30;
}

export type SyncWindowMode = "full" | "incremental";

export interface SyncWindow {
  startDate: Date;
  endDate: Date;
  mode: SyncWindowMode;
}

/**
 * The recent tail a sync fetches. Same semantics as Meta's
 * resolveSyncWindow (src/lib/meta-ads-hardening.ts), which Meta keeps
 * using: an explicit lookbackDays forces a full re-sync of that size;
 * otherwise a store that already synced re-pulls from (lastSyncAt −
 * 3 days) so delayed-reporting corrections land; a first sync pulls
 * the last 30 days.
 */
export function computeIncrementalWindow(input: {
  lastSyncAt?: Date | null;
  lookbackDays?: number;
  now?: Date;
}): SyncWindow {
  const now = input.now ?? new Date();
  if (input.lookbackDays !== undefined) {
    return {
      startDate: new Date(now.getTime() - input.lookbackDays * DAY_MS),
      endDate: now,
      mode: "full",
    };
  }
  if (input.lastSyncAt) {
    return {
      startDate: new Date(input.lastSyncAt.getTime() - BACKFILL_REPULL_DAYS * DAY_MS),
      endDate: now,
      mode: "incremental",
    };
  }
  return {
    startDate: new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * DAY_MS),
    endDate: now,
    mode: "full",
  };
}

/** Floor a date to UTC midnight so chunk boundaries are calendar days. */
export function floorDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface BackfillGap {
  startDate: Date;
  endDate: Date;
}

/**
 * The older range still missing for this account: from 365 days ago
 * up to the oldest date with contiguous stored coverage. `coveredFrom`
 * is the earlier of the persisted backfill tracker and the start of
 * the incremental window just fetched (whichever proves more
 * coverage). Returns null when coverage already reaches 365 days.
 */
export function computeBackfillGap(input: {
  now?: Date;
  backfillThrough?: Date | null;
  coverageStart?: Date | null;
}): BackfillGap | null {
  const now = input.now ?? new Date();
  const horizon = floorDay(new Date(now.getTime() - MAX_BACKFILL_DAYS * DAY_MS));
  const candidates = [input.backfillThrough, input.coverageStart].filter(
    (d): d is Date => !!d
  );
  const coveredFrom = candidates.length
    ? new Date(Math.min(...candidates.map((d) => d.getTime())))
    : null;
  if (coveredFrom && coveredFrom.getTime() <= horizon.getTime()) return null;
  const end = coveredFrom ? floorDay(coveredFrom) : floorDay(now);
  if (end.getTime() <= horizon.getTime()) return null;
  return { startDate: horizon, endDate: end };
}

export interface DateChunk {
  startDate: Date;
  endDate: Date;
}

/**
 * Split [start, end] into chunks of at most `chunkDays` days, NEWEST
 * first, with consecutive chunks sharing their boundary day (the
 * overlap is re-fetched once; upserts are idempotent). Newest-first
 * matters: after each chunk the tracker advances to the chunk's start,
 * so coverage stays contiguous from the tracker to now even if the
 * run dies halfway — the next run resumes from the tracker instead
 * of re-pulling completed chunks.
 */
export function splitDateRange(
  start: Date,
  end: Date,
  chunkDays = BACKFILL_CHUNK_DAYS
): DateChunk[] {
  const s = floorDay(start);
  const e = floorDay(end);
  if (e.getTime() <= s.getTime()) return [];
  const totalDays = Math.round((e.getTime() - s.getTime()) / DAY_MS);
  const n = Math.max(1, Math.ceil(totalDays / chunkDays));
  const chunks: DateChunk[] = [];
  for (let i = 0; i < n; i++) {
    const chunkEnd = new Date(e.getTime() - i * chunkDays * DAY_MS);
    const chunkStart = new Date(
      Math.max(s.getTime(), e.getTime() - (i + 1) * chunkDays * DAY_MS)
    );
    chunks.push({ startDate: chunkStart, endDate: chunkEnd });
  }
  return chunks;
}
