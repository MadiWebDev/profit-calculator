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
 *   currencyapi.net -> open.er-api.com (free, no key) -> stale cached rates
 *   -> throw. The stale fallback is logged, and callers already degrade
 *   gracefully (reporting aggregates unconverted; /api/fx/rates 503s).
 *
 * Caching: in-process, per base currency, with in-flight de-duplication.
 * Default TTL is 5 minutes when a currencyapi.net key is set, 12 hours
 * for the er-api fallback path. Override with
 * CURRENCY_API_CACHE_TTL_SECONDS (clamped to 60–3600 seconds). Note the
 * provider itself only refreshes every 60 minutes on Free/Essential
 * plans and every 60 seconds on StartUp/Professional plans — fetching
 * more often than the plan refreshes wastes quota without fresher data.
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
import { logger } from "@/lib/logger";

const ER_API_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

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
  const raw = Number(process.env.CURRENCY_API_CACHE_TTL_SECONDS ?? 300);
  const seconds = Number.isFinite(raw) ? Math.min(3600, Math.max(60, raw)) : 300;
  return seconds * 1000;
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
      const key = process.env.CURRENCY_API_KEY?.trim();
      if (key) {
        try {
          const usd = await fetchCurrencyApiUsdRates();
          const rates: FxRates = {
            base: baseCode,
            rates: rebaseRates(usd.rates, baseCode),
            fetchedAt: usd.fetchedAt,
          };
          cache.set(baseCode, { rates, expiresAt: now + cacheTtlMs() });
          return rates;
        } catch (primaryErr) {
          logger.warn("fx: currencyapi.net failed, falling back to er-api", {
            error: primaryErr instanceof Error ? primaryErr.message : "unknown",
          });
        }
      }
      try {
        const rates = await fetchErApiRates(baseCode);
        cache.set(baseCode, { rates, expiresAt: now + cacheTtlMs() });
        return rates;
      } catch (fallbackErr) {
        // Last resort: stale cached rates beat no rates for a display report.
        if (cached) {
          logger.warn("fx: provider failed, serving stale cached rates", {
            error: fallbackErr instanceof Error ? fallbackErr.message : "unknown",
            base: baseCode,
          });
          return cached.rates;
        }
        throw fallbackErr;
      }
    } finally {
      inflight.delete(baseCode);
    }
  })();

  inflight.set(baseCode, job);
  return job;
}

/** Test helper — clears the in-process cache and in-flight map. */
export function clearFxCache(): void {
  cache.clear();
  inflight.clear();
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
