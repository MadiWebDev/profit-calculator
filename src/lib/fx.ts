/**
 * FX rates provider — server-side only.
 *
 * Primary source: currencyapi.net (https://currencyapi.net/api/v2/rates).
 * The API key is server-only (CURRENCY_API_KEY) and is never sent to the
 * browser — /api/fx/rates returns rates only, never the key.
 *
 * Response shape (documented, currencyapi.net):
 *   { "valid": true, "updated": 1768586454, "base": "USD",
 *     "rates": { "EUR": 0.92, "PKR": 278.5, ... } }
 * Rates are units of currency per 1 base currency. Two traps handled here:
 *  1. The provider's rates object does NOT include the base currency
 *     itself, so convertCurrency() would throw "Unknown FX rate for USD".
 *     We always inject rates[base] = 1.
 *  2. Free-plan accounts have a fixed base currency, so we always request
 *     base=USD from the provider and re-base mathematically to whatever
 *     base the caller asked for. Ratios are invariant to the base, so
 *     converting PKR -> EUR gives the same result either way.
 *
 * Fallback chain (reports must stay available):
 *   currencyapi.net -> open.er-api.com (free, no key) -> stale cached
 *   rates (the DB snapshot first, then the in-process entry) -> throw.
 *   The stale fallback is logged, and callers already degrade
 *   gracefully (reporting aggregates unconverted; /api/fx/rates 503s).
 *
 * Caching: two layers, so the 500-request/month free quota is spent
 * once per refresh for the whole deployment — not once per serverless
 * instance. L1 is the in-process map below (per base currency, with
 * in-flight de-duplication). L2 is a single FxRateSnapshot document
 * in MongoDB holding the USD rates table: every instance reads it,
 * and a refresh atomically replaces it — the old snapshot is deleted
 * only after the new rates have been fetched successfully, so a
 * failed fetch never deletes the last good rates. The snapshot is
 * always USD-based; any other base is re-based mathematically in
 * memory, so one document serves every base currency. Because the
 * dashboard page and /api/fx/rates run in SEPARATE server bundles
 * (and separate serverless instances on Vercel), in-process dedup
 * cannot stop them racing the same refresh — a refresh lock on the
 * snapshot document (refreshingAt/refreshingBy, 60s expiry) makes
 * exactly one instance fetch while the others wait for its save.
 *
 * Default TTL is 90 minutes (CURRENCY_API_CACHE_TTL_SECONDS=5400):
 * 24h / 1.5h = 16 refreshes a day, 480 a month (30 days) / 496 (31
 * days) — inside the free plan's 500. The provider itself refreshes
 * hourly on Free/Essential plans, so a 90-minute cache loses nothing
 * versus a 60-minute one. Override with
 * CURRENCY_API_CACHE_TTL_SECONDS (clamped to 60–10800 seconds).
 * Commercial use of GetProfitCalc requires a PAID currencyapi.net plan:
 * the free plan is personal-use only.
 *
 * Live mode: set CURRENCY_API_LIVE=1 to cache for only 60 seconds — the
 * fastest the provider ever refreshes. This is only real-time on a
 * StartUp/Professional plan (60-second provider refresh); on a Free or
 * Essential plan the provider data itself is still hourly, and a 60-second
 * cache will burn the monthly quota for no fresher data. The dashboard
 * client also re-fetches /api/fx/rates every 60 seconds while open, so
 * display conversion tracks the freshest cached rates without a reload.
 *
 * Note: rates are indicative spot rates for DISPLAY conversion. They are
 * not historical settlement rates — do not use them to restate historical
 * profit. Order-time FX, where stored, lives separately (see profit-extended).
 */
import type { FxRates } from "@/lib/profit-engine";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import mongoose from "mongoose";
import { FxRateSnapshotModel } from "@/models/FxRateSnapshot";

const ER_API_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
/** The single snapshot key — the stored table is always USD-based. */
const FX_SNAPSHOT_KEY = "USD";

interface CacheEntry {
  rates: FxRates;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FxRates>>();

function isValidCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** Keep only positive, finite rates, with upper-cased codes. */
function normalizeRates(input: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(input)) {
    const upper = code.toUpperCase().trim();
    const n = typeof value === "number" ? value : Number(value);
    if (/^[A-Z]{3}$/.test(upper) && Number.isFinite(n) && n > 0) {
      out[upper] = n;
    }
  }
  return out;
}

/**
 * Parse a currencyapi.net /v2/rates payload into USD-based FxRates.
 * Throws on an invalid payload so a bad response is never cached as rates.
 */
export function parseCurrencyApiRates(payload: unknown): FxRates {
  const data = payload as {
    valid?: unknown;
    updated?: unknown;
    base?: unknown;
    rates?: unknown;
    message?: unknown;
    error?: unknown;
  } | null;
  if (!data || typeof data !== "object") {
    throw new Error("currencyapi.net returned an unexpected payload");
  }
  if (data.valid === false) {
    const detail =
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : "invalid API key or request";
    throw new Error(`currencyapi.net rejected the request: ${detail}`);
  }
  if (!data.rates || typeof data.rates !== "object" || Array.isArray(data.rates)) {
    throw new Error("currencyapi.net returned an unexpected payload");
  }
  const rates = normalizeRates(data.rates as Record<string, unknown>);
  if (Object.keys(rates).length === 0) {
    throw new Error("currencyapi.net returned no usable rates");
  }
  // The provider omits the base currency itself — inject it (see header).
  rates.USD = 1;
  const updated =
    typeof data.updated === "number" && Number.isFinite(data.updated)
      ? new Date(data.updated * 1000).toISOString()
      : new Date().toISOString();
  return { base: "USD", rates, fetchedAt: updated };
}

/**
 * Re-base a rates table from its current base to a new base currency.
 * Pure function, ratio-preserving: amount / fromRate * toRate is unchanged.
 */
export function rebaseRates(
  rates: Record<string, number>,
  targetBase: string,
): Record<string, number> {
  const base = targetBase.toUpperCase().trim();
  if (base === "USD") return { ...rates, USD: 1 };
  const divisor = rates[base];
  if (!divisor || divisor <= 0) {
    throw new Error(`Unknown FX rate for currency: ${base}`);
  }
  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(rates)) {
    out[code] = value / divisor;
  }
  out[base] = 1;
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "GetProfitCalc/1.0", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCurrencyApiUsdRates(): Promise<FxRates> {
  const key = process.env.CURRENCY_API_KEY?.trim();
  if (!key) throw new Error("CURRENCY_API_KEY is not set");
  const params = new URLSearchParams({ key, base: "USD" });
  const payload = await fetchJson(`https://currencyapi.net/api/v2/rates?${params.toString()}`);
  return parseCurrencyApiRates(payload);
}

async function fetchErApiRates(baseCode: string): Promise<FxRates> {
  const payload = (await fetchJson(
    `https://open.er-api.com/v6/latest/${baseCode}`,
  )) as {
    result?: string;
    base_code?: string;
    rates?: Record<string, unknown>;
  };
  if (payload.result !== "success" || !payload.rates || typeof payload.rates !== "object") {
    throw new Error("FX provider returned an unexpected payload");
  }
  const rates = normalizeRates(payload.rates);
  if (Object.keys(rates).length === 0) {
    throw new Error("FX provider returned no usable rates");
  }
  rates[baseCode] = 1;
  return { base: payload.base_code ?? baseCode, rates, fetchedAt: new Date().toISOString() };
}

function cacheTtlMs(): number {
  const key = process.env.CURRENCY_API_KEY?.trim();
  if (!key) return ER_API_CACHE_TTL_MS;
  // Live mode wins over the TTL env var: 60s is the provider's fastest
  // refresh, and caching longer would make "live" a lie.
  if (process.env.CURRENCY_API_LIVE === "1") return 60 * 1000;
  // Default 90 minutes: 16 refreshes/day, 480/month (30 days) — inside
  // the free plan's 500 requests/month. Clamped to 60s–3h.
  const raw = Number(process.env.CURRENCY_API_CACHE_TTL_SECONDS ?? 5400);
  const seconds = Number.isFinite(raw) ? Math.min(10800, Math.max(60, raw)) : 5400;
  return seconds * 1000;
}

interface SnapshotRead {
  usd: FxRates;
  /** Milliseconds since this snapshot was SAVED (its updatedAt). The
   *  TTL clock runs from the save, not from the provider's `updated`
   *  timestamp — free-plan data is already up to an hour old when it
   *  arrives, and measuring from `updated` would halve the effective
   *  cache life and double the monthly request count. */
  ageMs: number;
}

/**
 * Read the shared rates snapshot from MongoDB. Returns null when there
 * is no snapshot, when it is unusable, when the database is not
 * connected (unit tests, build-time prerender), or when the read
 * itself fails — the caller then falls through to a provider fetch
 * exactly as before. A failed read never throws: the snapshot is a
 * cache, not a dependency.
 */
async function readFxSnapshot(): Promise<SnapshotRead | null> {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    const doc = await FxRateSnapshotModel.findOne({ key: FX_SNAPSHOT_KEY }).lean();
    if (!doc || !doc.rates || typeof doc.rates !== "object") return null;
    const rates = normalizeRates(doc.rates as Record<string, unknown>);
    if (Object.keys(rates).length === 0) return null;
    rates.USD = 1;
    const savedAt =
      doc.updatedAt instanceof Date
        ? doc.updatedAt.getTime()
        : doc.fetchedAt instanceof Date
          ? doc.fetchedAt.getTime()
          : Date.now();
    const fetchedAt =
      doc.fetchedAt instanceof Date ? doc.fetchedAt.toISOString() : new Date().toISOString();
    return { usd: { base: "USD", rates, fetchedAt }, ageMs: Date.now() - savedAt };
  } catch (err) {
    logger.warn("fx: could not read rates snapshot, continuing without it", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/**
 * Atomically replace the shared snapshot with freshly fetched rates.
 * findOneAndReplace + upsert is one operation: the collection holds
 * exactly one snapshot — the old one is gone only because the new one
 * is saved in the same step. Callers invoke this only AFTER a
 * successful provider fetch, so a failed fetch never deletes the
 * last good rates. A failed write is logged and swallowed: the
 * in-process cache still serves this instance.
 */
async function saveFxSnapshot(
  usd: FxRates,
  source: "currencyapi.net" | "er-api",
): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await FxRateSnapshotModel.findOneAndReplace(
      { key: FX_SNAPSHOT_KEY },
      {
        key: FX_SNAPSHOT_KEY,
        base: "USD",
        rates: usd.rates,
        fetchedAt: new Date(usd.fetchedAt),
        source,
      },
      { upsert: true },
    );
  } catch (err) {
    logger.warn("fx: could not persist rates snapshot (in-process cache still applies)", {
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

interface UsdTableResult {
  usd: FxRates;
  /** False when the provider failed and a STALE snapshot was served —
   *  callers must not extend the in-process cache with stale rates. */
  fresh: boolean;
}

/**
 * The one shared in-flight fetch of the USD rates table.
 *
 * Every base is re-based from this single table in memory, so one
 * provider call serves every concurrent caller — the dashboard (team
 * base) and /api/fx/rates (USD) racing after a refresh must not each
 * spend a request, or a 90-minute window costs 2 calls and the month
 * costs 960, over the free plan's 500. Per-base in-flight dedup
 * alone cannot do this: USD, EUR and PKR are different cache keys.
 * The promise is shared across bases and cleared when it settles, so
 * the next refresh starts a new fetch; the DB snapshot is what
 * dedups across serverless instances.
 */
let usdFetch: Promise<UsdTableResult> | null = null;

/** How long a refresh claim lives before a crashed holder's lock
 *  may be taken over (a real fetch takes seconds). */
const FX_REFRESH_LOCK_MS = 60_000;
/** How long a loser waits for the winner's save before fetching
 *  anyway (a real fetch takes well under this). */
const FX_REFRESH_WAIT_MS = 5_000;
const FX_REFRESH_POLL_MS = 250;

/**
 * Atomically claim the right to refresh the snapshot. One atomic
 * findOneAndUpdate: free-or-expired lock → we hold it; a fresh lock
 * held by another instance → the upsert insert collides on the unique
 * `key` (E11000) → "busy". Returns "unavailable" when the database
 * is not connected (callers then fetch without waiting — the lock
 * only exists to dedup across instances, never to block a refresh).
 * Exported for the lock tests.
 */
export async function claimFxRefreshLock(
  token: string,
): Promise<"held" | "busy" | "unavailable"> {
  try {
    if (mongoose.connection.readyState !== 1) return "unavailable";
    const doc = await FxRateSnapshotModel.findOneAndUpdate(
      {
        key: FX_SNAPSHOT_KEY,
        $or: [
          { refreshingAt: { $exists: false } },
          { refreshingAt: null },
          { refreshingAt: { $lt: new Date(Date.now() - FX_REFRESH_LOCK_MS) } },
        ],
      },
      { $set: { refreshingAt: new Date(), refreshingBy: token } },
      { upsert: true, new: true },
    ).lean();
    return doc?.refreshingBy === token ? "held" : "busy";
  } catch (err) {
    // Another instance claimed it first — the upsert insert hit the
    // unique key. Any other error means the DB is unusable right now.
    if ((err as { code?: number })?.code === 11000) return "busy";
    logger.warn("fx: could not claim refresh lock, fetching without it", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return "unavailable";
  }
}

/** Release a lock we hold (only after a FAILED fetch — a successful
 *  save replaces the whole document and clears the lock with it).
 *  A lock claimed on a cold start (no snapshot yet) upserted a
 *  rates-less document — delete it so the collection keeps its
 *  "exactly one snapshot, or none" invariant. Otherwise just clear
 *  the lock fields and keep the last good rates.
 *  Exported for the lock tests. */
export async function releaseFxRefreshLock(token: string): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await FxRateSnapshotModel.deleteOne({
      key: FX_SNAPSHOT_KEY,
      refreshingBy: token,
      rates: { $exists: false },
    });
    await FxRateSnapshotModel.updateOne(
      { key: FX_SNAPSHOT_KEY, refreshingBy: token },
      { $set: { refreshingAt: null, refreshingBy: null } },
    );
  } catch {
    // Lock cleanup only — a stale lock expires on its own after 60s.
  }
}

/** Wait for another instance's refresh to land as a fresh snapshot.
 *  Returns the fresh USD table, or null after the timeout.
 *  Exported for the lock tests. */
export async function waitForFreshSnapshot(): Promise<FxRates | null> {
  const deadline = Date.now() + FX_REFRESH_WAIT_MS;
  while (Date.now() < deadline) {
    const snap = await readFxSnapshot();
    if (snap && snap.ageMs < cacheTtlMs()) return snap.usd;
    await new Promise((r) => setTimeout(r, FX_REFRESH_POLL_MS));
  }
  return null;
}

async function fetchUsdTable(): Promise<UsdTableResult> {
  if (usdFetch) return usdFetch;
  usdFetch = (async (): Promise<UsdTableResult> => {
    try {
      // Re-check the shared snapshot first: another serverless instance
      // may have refreshed it while this request was queued, and its
      // save is the cheapest possible answer — no provider call at all.
      const snap = await readFxSnapshot();
      if (snap && snap.ageMs < cacheTtlMs()) {
        return { usd: snap.usd, fresh: true };
      }

      // Claim the refresh before spending a provider call. Without
      // this, the dashboard page and /api/fx/rates — separate bundles
      // with separate in-process state — each fetch on the same
      // refresh, doubling the monthly count.
      const token = randomUUID();
      const claim = await claimFxRefreshLock(token);
      if (claim === "busy") {
        const waited = await waitForFreshSnapshot();
        if (waited) return { usd: waited, fresh: true };
        // Timed out — the holder may have crashed. Fall through and
        // fetch; the next claim will take over the expired lock.
      }

      const key = process.env.CURRENCY_API_KEY?.trim();
      if (key) {
        try {
          const usd = await fetchCurrencyApiUsdRates();
          // Save FIRST so every other instance reuses these rates; the
          // replace is atomic and only happens after a good fetch.
          // The save replaces the whole document, clearing the lock.
          await saveFxSnapshot(usd, "currencyapi.net");
          return { usd, fresh: true };
        } catch (primaryErr) {
          logger.warn("fx: currencyapi.net failed, falling back to er-api", {
            error: primaryErr instanceof Error ? primaryErr.message : "unknown",
          });
        }
      }
      // The er-api fallback always fetches the USD table too, so the
      // snapshot stays USD-based and every base shares the one call.
      try {
        const er = await fetchErApiRates("USD");
        const usd: FxRates = { base: "USD", rates: er.rates, fetchedAt: er.fetchedAt };
        await saveFxSnapshot(usd, "er-api");
        return { usd, fresh: true };
      } catch (fallbackErr) {
        // Release the lock so the next caller retries promptly instead
        // of waiting out the 60s expiry.
        if (claim === "held") await releaseFxRefreshLock(token);
        // Last resort: the durable stale snapshot beats no rates for a
        // display report. Only with no snapshot at all do we throw.
        if (snap) {
          logger.warn("fx: provider failed, serving stale snapshot rates", {
            error: fallbackErr instanceof Error ? fallbackErr.message : "unknown",
          });
          return { usd: snap.usd, fresh: false };
        }
        throw fallbackErr;
      }
    } finally {
      usdFetch = null;
    }
  })();
  return usdFetch;
}

export async function getFxRates(base: string = "USD", overrides?: FxOverrideInput[]): Promise<FxRates> {
  const baseCode = base.toUpperCase().trim();
  if (!isValidCode(baseCode)) throw new Error(`Invalid currency code: ${base}`);

  // Manual overrides (saved on WorkspaceSettings) win over fetched
  // rates. Overrides are stored as units per 1 USD, so they are
  // applied to the USD-based table BEFORE re-basing — and never
  // cached: the cache below holds provider rates only, shared across
  // teams, and must never serve one team's overrides to another.
  if (overrides && overrides.length > 0) {
    const usd = await getFxRates("USD");
    const rates: FxRates = {
      base: baseCode,
      rates: rebaseRates(applyFxOverrides(usd.rates, overrides), baseCode),
      fetchedAt: usd.fetchedAt,
    };
    return rates;
  }

  const now = Date.now();
  const cached = cache.get(baseCode);
  if (cached && now < cached.expiresAt) return cached.rates;

  const ongoing = inflight.get(baseCode);
  if (ongoing) return ongoing;

  const job = (async (): Promise<FxRates> => {
    try {
      // One shared USD-table fetch serves every base: the table is
      // re-based in memory below, so concurrent callers for USD, EUR,
      // PKR... share a single provider call.
      let result: UsdTableResult;
      try {
        result = await fetchUsdTable();
      } catch (err) {
        // No snapshot and both providers failed — last resort is the
        // in-process stale entry for this base.
        if (cached) {
          logger.warn("fx: provider failed, serving stale cached rates", {
            error: err instanceof Error ? err.message : "unknown",
            base: baseCode,
          });
          return cached.rates;
        }
        throw err;
      }
      let rates: FxRates;
      try {
        rates = {
          base: baseCode,
          rates: rebaseRates(result.usd.rates, baseCode),
          fetchedAt: result.usd.fetchedAt,
        };
      } catch {
        // Unknown base in the table — the in-process stale entry (if
        // any) is the last resort, otherwise this really is an error.
        if (cached) return cached.rates;
        throw new Error(`Unknown FX rate for currency: ${baseCode}`);
      }
      // Only fresh rates extend the in-process cache — stale rates are
      // served once and the next call retries the provider.
      if (result.fresh) {
        cache.set(baseCode, { rates, expiresAt: now + cacheTtlMs() });
      }
      return rates;
    } finally {
      inflight.delete(baseCode);
    }
  })();

  inflight.set(baseCode, job);
  return job;
}

/** Test helper — clears the in-process cache, in-flight maps, and the
 *  shared USD-table fetch (so a test never reuses a previous test's
 *  settled fetch). */
export function clearFxCache(): void {
  cache.clear();
  inflight.clear();
  usdFetch = null;
}

/**
 * Test helper — deletes the persisted snapshot (no-op when the
 * database is not connected). Lets tests simulate a cold start or a
 * fresh deployment with no saved rates.
 */
export async function clearFxRateSnapshot(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await FxRateSnapshotModel.deleteOne({ key: FX_SNAPSHOT_KEY });
  } catch {
    // Test cleanup only — a failed delete must never fail a test run.
  }
}

/** One saved manual FX override: units of `currency` per 1 USD. */
export interface FxOverrideInput {
  currency: string;
  rate: number;
  effectiveFrom: Date | string;
}

/**
 * Apply manual FX overrides to a USD-based rates table (units per
 * 1 USD). Rules:
 * - Only overrides whose effectiveFrom is on/before `now` apply; a
 *   future-dated override is ignored until its date arrives.
 * - When several overrides exist for one currency, the latest
 *   effective one wins.
 * - An override for USD itself is ignored (1 USD = 1 USD by
 *   definition); invalid codes and non-positive rates are ignored.
 * Pure — safe to unit-test without the network.
 */
export function applyFxOverrides(
  usdRates: Record<string, number>,
  overrides: FxOverrideInput[],
  now: Date = new Date(),
): Record<string, number> {
  const out = { ...usdRates };
  const best = new Map<string, { rate: number; from: number }>();
  for (const o of overrides) {
    const code = (o.currency ?? "").toUpperCase().trim();
    if (code === "USD" || !/^[A-Z]{3}$/.test(code)) continue;
    const rate = typeof o.rate === "number" ? o.rate : Number(o.rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const from = new Date(o.effectiveFrom).getTime();
    if (Number.isNaN(from) || from > now.getTime()) continue;
    const cur = best.get(code);
    if (!cur || from >= cur.from) best.set(code, { rate, from });
  }
  for (const [code, { rate }] of best) out[code] = rate;
  return out;
}

export async function logFxFailure(err: unknown): Promise<void> {
  logger.warn("fx rates fetch failed", {
    error: err instanceof Error ? err.message : "unknown",
  });
}
