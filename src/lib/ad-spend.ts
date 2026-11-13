/**
 * Synced ad spend — the bridge between `AdSpendDaily` (what the ad
 * platforms report) and the headline profit figures (which historically
 * read only per-order `adSpendAllocated`, a field Shopify sync always
 * writes as 0 — FINAL-REPORT F5).
 *
 * Money contract (dictated by the Phase 1 spec):
 *   totalAdSpend(period) = syncedAdSpend(period, converted to base)
 *                        + Σ per-order adSpendAllocated (converted to base)
 * The two sources are disjoint by construction — nothing ever copies
 * synced spend into `adSpendAllocated` — so there is no double-counting.
 *
 * FX behaviour: each `AdSpendDaily` row carries its provider account's
 * currency and is converted row-by-row into the base currency with the
 * shared `convertCurrency` helper (same-currency rows are exact).
 * - `rates` provided (non-null): use them, never fetch.
 * - `rates === null`: the caller has no FX rates (e.g. the dashboard,
 *   which already warned and aggregates orders unconverted) — sum the
 *   rows unconverted (fail-open, matching the dashboard convention).
 * - `rates === undefined`: fetch via `getFxRates(baseCurrency)`; if the
 *   fetch fails while conversion is actually needed, throw so API
 *   callers can answer 503 FX_UNAVAILABLE (same pattern as the
 *   meta-attribution endpoint). When every row is already in the base
 *   currency no fetch happens at all.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { getFxRates } from "@/lib/fx";
import { convertCurrency } from "@/lib/profit-engine";

export interface SyncedAdSpendRow {
  spend: number;
  currency?: string | null;
  platform?: string | null;
  date?: Date | string | null;
}

export interface SyncedAdSpend {
  /** Total synced spend in the base currency, rounded to 2dp. */
  total: number;
  /** Per-platform totals in the base currency. */
  byPlatform: Record<string, number>;
  /** Per-day totals in the base currency, keyed `YYYY-MM-DD`. */
  byDay: Record<string, number>;
}

function num(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pure aggregation: convert each row into `baseCurrency` and sum.
 * `rates` follows the same contract as `getSyncedAdSpend`: `null`
 * means "no rates available — sum unconverted". Throws on an unknown
 * currency (via `convertCurrency`) so callers can 503 instead of
 * silently reporting unconverted spend.
 */
export function sumSyncedAdSpendRows(
  rows: SyncedAdSpendRow[],
  baseCurrency: string,
  rates: Record<string, number> | null
): SyncedAdSpend {
  const base = baseCurrency.toUpperCase().trim();
  const total: SyncedAdSpend = { total: 0, byPlatform: {}, byDay: {} };
  for (const row of rows ?? []) {
    const from = (row.currency ?? base).toUpperCase().trim() || base;
    const converted =
      rates === null || from === base
        ? num(row.spend)
        : convertCurrency(num(row.spend), from, base, rates);
    total.total += converted;
    const platform = (row.platform ?? "unknown").toLowerCase();
    total.byPlatform[platform] = (total.byPlatform[platform] ?? 0) + converted;
    const day =
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : typeof row.date === "string"
          ? row.date.slice(0, 10)
          : null;
    if (day) total.byDay[day] = (total.byDay[day] ?? 0) + converted;
  }
  total.total = round2(total.total);
  for (const k of Object.keys(total.byPlatform)) total.byPlatform[k] = round2(total.byPlatform[k]);
  for (const k of Object.keys(total.byDay)) total.byDay[k] = round2(total.byDay[k]);
  return total;
}

export interface GetSyncedAdSpendOptions {
  /**
   * FX rates table (units per 1 base unit, as returned by
   * `getFxRates(base).rates`). `undefined` = fetch here (throw on
   * failure when conversion is needed); `null` = fail-open, sum
   * unconverted. See the module doc comment.
   */
  rates?: Record<string, number> | null;
  /** Restrict to one store's ad accounts (AdSpendDaily.storeId). */
  storeId?: string;
}

/**
 * Sum `AdSpendDaily` spend for a team in `[from, to]` (inclusive),
 * converted into `baseCurrency`. Returns zeros — never throws — when
 * there are no rows in range. Throws only when FX rates are needed
 * and unavailable (callers: answer 503 FX_UNAVAILABLE).
 */
export async function getSyncedAdSpend(
  teamId: string,
  from: Date | null | undefined,
  to: Date | null | undefined,
  baseCurrency: string,
  options: GetSyncedAdSpendOptions = {}
): Promise<SyncedAdSpend> {
  await connectDB();
  const match: Record<string, unknown> = {
    teamId: new mongoose.Types.ObjectId(teamId),
  };
  if (options.storeId && mongoose.Types.ObjectId.isValid(options.storeId)) {
    match.storeId = new mongoose.Types.ObjectId(options.storeId);
  }
  if (from || to) {
    match.date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }
  const rows = await AdSpendDailyModel.find(match)
    .select("spend currency platform date")
    .lean();

  const base = baseCurrency.toUpperCase().trim();
  const needsFx = rows.some(
    (r) => ((r.currency ?? base).toUpperCase().trim() || base) !== base
  );
  if (!needsFx) {
    return sumSyncedAdSpendRows(rows, base, null);
  }

  let rates = options.rates;
  if (rates === undefined) {
    // Throws when FX is unavailable — the caller turns this into 503.
    rates = (await getFxRates(base)).rates;
  }
  return sumSyncedAdSpendRows(rows, base, rates ?? null);
}
