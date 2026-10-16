/**
 * FX rates provider — server-side.
 *
 * Source: open.er-api.com (free, no key). Rates are quoted as units of
 * currency per 1 USD, matching the profit-engine's convertCurrency()
 * convention. Results are cached in-process for 12h; concurrent callers
 * share one in-flight request.
 *
 * Note: rates are indicative spot rates for DISPLAY conversion. They are
 * not historical settlement rates — do not use them for accounting.
 */
import type { FxRates } from "@/lib/profit-engine";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  rates: FxRates;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FxRates>>();

function isValidCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export async function getFxRates(base: string = "USD"): Promise<FxRates> {
  const baseCode = base.toUpperCase().trim();
  if (!isValidCode(baseCode)) throw new Error(`Invalid currency code: ${base}`);

  const now = Date.now();
  const cached = cache.get(baseCode);
  if (cached && now < cached.expiresAt) return cached.rates;

  const ongoing = inflight.get(baseCode);
  if (ongoing) return ongoing;

  const job = (async (): Promise<FxRates> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://open.er-api.com/v6/latest/${baseCode}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "GetProfitCalc/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);

      const data = (await res.json()) as {
        result?: string;
        base_code?: string;
        rates?: Record<string, number>;
        time_last_update_utc?: string;
      };
      if (data.result !== "success" || !data.rates || typeof data.rates !== "object") {
        throw new Error("FX provider returned an unexpected payload");
      }

      const rates: FxRates = {
        base: data.base_code ?? baseCode,
        rates: data.rates,
        fetchedAt: new Date().toISOString(),
      };
      cache.set(baseCode, { rates, expiresAt: now + CACHE_TTL_MS });
      return rates;
    } finally {
      inflight.delete(baseCode);
    }
  })();

  inflight.set(baseCode, job);
  return job;
}

/** Test helper — clears the in-process cache. */
export function clearFxCache(): void {
  cache.clear();
}

export async function logFxFailure(err: unknown): Promise<void> {
  logger.warn("fx rates fetch failed", {
    error: err instanceof Error ? err.message : "unknown",
  });
}
