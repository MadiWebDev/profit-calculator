/**
 * paddle-pricing.ts — SERVER ONLY. Never import from client components
 * (it pulls in the Paddle Node SDK + mongoose-backed tier config).
 *
 * Server-side Paddle price preview with caching, so /pricing doesn't have
 * to wait for the browser to download Paddle.js and run PricePreview:
 *
 *   - one SDK call for all 12 price IDs (3 tiers × 4 intervals)
 *   - in-memory cache per country (fresh 1h) — repeat visits are instant
 *   - in-flight dedup — concurrent requests share one underlying fetch
 *   - stale-while-revalidate — a stale entry is served immediately while
 *     a background refresh runs; a refresh failure keeps serving stale
 *   - graceful degradation — no PADDLE_API_KEY or a failed SDK call
 *     returns null; callers fall back to the client-side PricePreview
 *     flow and the page never crashes
 *
 * The preview is fetched with the same country the pricing page already
 * detects (x-vercel-ip-country); without a country Paddle auto-detects
 * from the request IP, exactly like the client flow does today.
 */

import type { CountryCode } from "@paddle/paddle-node-sdk";
import { getPaddleClient } from "@/lib/paddle";
import { getTiers } from "@/lib/tiers";
import { logger } from "@/lib/logger";
import {
  allPriceIds,
  buildPriceCacheKey,
  buildPriceMap,
  type PriceMap,
} from "@/lib/paddle-price-map";

// ── Tunables ──────────────────────────────────────────────────────────────────

/** A cached preview is fresh for 1 hour. */
export const PRICE_PREVIEW_TTL_MS = 60 * 60 * 1000;
/** A stale preview may still be served (while refreshing) for up to 24h. */
export const PRICE_PREVIEW_STALE_MS = 24 * 60 * 60 * 1000;
/** Give up on a hung Paddle call after 5s — the caller falls back. */
export const PRICE_PREVIEW_TIMEOUT_MS = 5_000;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Fetches a fresh PriceMap for a country (undefined = Paddle auto-detect). */
export type PricePreviewFetcher = (
  countryCode: string | undefined
) => Promise<PriceMap>;

interface CacheEntry {
  data: PriceMap;
  fetchedAt: number;
  /** In-flight fetch shared by concurrent callers (dedup). */
  inflight: Promise<PriceMap | null> | null;
}

export interface PricePreviewCacheOptions {
  fetchPreview: PricePreviewFetcher;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

/**
 * Creates an in-memory preview cache. The app uses one module-level
 * instance (below); tests create their own with a fake fetcher + clock.
 */
export function createPricePreviewCache({
  fetchPreview,
  now = Date.now,
}: PricePreviewCacheOptions) {
  const entries = new Map<string, CacheEntry>();

  function keyFor(countryCode: string | undefined): string {
    return buildPriceCacheKey(
      countryCode,
      allPriceIds(getTiers())
    );
  }

  async function refresh(
    key: string,
    countryCode: string | undefined,
    entry: CacheEntry | undefined
  ): Promise<PriceMap | null> {
    try {
      const data = await fetchPreview(countryCode);
      entries.set(key, { data, fetchedAt: now(), inflight: null });
      return data;
    } catch (err) {
      logger.warn("[paddle-pricing] preview fetch failed", {
        country: countryCode ?? "auto",
        error: err instanceof Error ? err.message : String(err),
      });
      // Serve the stale entry if we have one — but keep its ORIGINAL
      // fetchedAt so the next call retries the fetch instead of treating
      // stale data as fresh. With no stale entry, report unavailable.
      const current = entries.get(key);
      if (current) current.inflight = null;
      if (entry) return entry.data;
      entries.delete(key);
      return null;
    }
  }

  return {
    /**
     * Returns the cached preview for a country, or null when Paddle is
     * unavailable and nothing usable is cached. Never throws.
     */
    async get(countryCode: string | undefined): Promise<PriceMap | null> {
      const normalized =
        countryCode && /^[A-Z]{2}$/.test(countryCode.toUpperCase())
          ? countryCode.toUpperCase()
          : undefined;
      const key = keyFor(normalized);
      const entry = entries.get(key);
      const age = entry ? now() - entry.fetchedAt : Number.POSITIVE_INFINITY;

      // A fetch is already running — share it (dedup). Checked BEFORE the
      // fresh check: a placeholder entry carries fetchedAt 0, which must
      // never be mistaken for fresh data.
      if (entry?.inflight) return entry.inflight;

      // Fresh — serve immediately.
      if (entry && age < PRICE_PREVIEW_TTL_MS) return entry.data;

      // Stale but usable — serve it now, refresh in the background.
      if (entry && age < PRICE_PREVIEW_STALE_MS) {
        entry.inflight = refresh(key, normalized, entry)
          .catch(() => null)
          .finally(() => {
            const current = entries.get(key);
            if (current) current.inflight = null;
          });
        return entry.data;
      }

      // Cold (or too stale to serve) — fetch and await it. The placeholder
      // holds the in-flight promise so concurrent callers dedup onto it;
      // refresh() owns all map writes (fresh store / failure cleanup).
      const pending = refresh(key, normalized, entry);
      entries.set(key, {
        data: entry?.data ?? {},
        fetchedAt: entry?.fetchedAt ?? 0,
        inflight: pending,
      });
      return pending;
    },

    /** Test/support hook: number of cached country entries. */
    size(): number {
      return entries.size;
    },
  };
}

// ── Real fetcher (Paddle Node SDK) ────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Paddle preview timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * One SDK preview call for all 12 price IDs. Throws when PADDLE_API_KEY
 * is unset (getPaddleClient fails fast) or the SDK call fails — the
 * cache converts that into a null (degraded) result.
 */
export async function fetchPreviewFromPaddle(
  countryCode: string | undefined
): Promise<PriceMap> {
  const tiers = getTiers();
  const items = tiers.flatMap((t) => [
    { priceId: t.priceId.month, quantity: 1 },
    { priceId: t.priceId.quarter, quantity: 1 },
    { priceId: t.priceId.semiannual, quantity: 1 },
    { priceId: t.priceId.year, quantity: 1 },
  ]);

  const client = getPaddleClient();
  const preview = await withTimeout(
    client.pricingPreview.preview({
      items,
      ...(countryCode
        ? { address: { countryCode: countryCode as CountryCode } }
        : {}),
    }),
    PRICE_PREVIEW_TIMEOUT_MS
  );

  return buildPriceMap(
    tiers,
    preview.details.lineItems.map((li) => ({
      priceId: li.price.id,
      formattedTotal: li.formattedTotals.total,
      subtotalMinor: li.totals.subtotal,
    })),
    preview.currencyCode
  );
}

// ── Module-level cache (the app's instance) ───────────────────────────────────

const defaultCache = createPricePreviewCache({
  fetchPreview: fetchPreviewFromPaddle,
});

/** True when the server-side preview path can run (PADDLE_API_KEY set). */
export function isPaddlePricingConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY);
}

/**
 * Cached server-side price preview for a country. Returns null when
 * Paddle is unavailable (no API key, SDK failure, timeout) — callers
 * must fall back to the client-side PricePreview flow. Never throws.
 */
export async function getCachedPricePreview(
  countryCode: string | undefined
): Promise<PriceMap | null> {
  if (!isPaddlePricingConfigured()) return null;
  try {
    return await defaultCache.get(countryCode);
  } catch {
    return null;
  }
}
