/**
 * paddle-prices-client.ts — client-safe price helpers (isomorphic, no
 * Node-only imports). Used by PricingClient and usePaddlePricing for the
 * fast path: sessionStorage first, then the server-side cached preview
 * route, with the Paddle.js PricePreview as the last-resort fallback.
 *
 * The sessionStorage entry is keyed by country + the 12 price IDs and
 * lives ~1h, so repeat visits and navigation are instant even when the
 * server preview is unavailable.
 */

import {
  buildPriceCacheKey,
  PRICE_MAP_CACHE_VERSION,
  type PriceMap,
} from "@/lib/paddle-price-map";

/** Session prices are fresh for 1 hour. */
export const CLIENT_PRICES_TTL_MS = 60 * 60 * 1000;

const STORAGE_PREFIX = `gpc:paddle-prices:${PRICE_MAP_CACHE_VERSION}:`;

export function buildClientPricesCacheKey(
  countryCode: string | undefined,
  priceIds: string[]
): string {
  return `${STORAGE_PREFIX}${buildPriceCacheKey(countryCode, priceIds)}`;
}

interface StoredPrices {
  savedAt: number;
  prices: PriceMap;
}

function isPriceMap(value: unknown): value is PriceMap {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every(
    (entry) =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as { total?: unknown }).total === "string" &&
      typeof (entry as { perMonth?: unknown }).perMonth === "string" &&
      typeof (entry as { currencyCode?: unknown }).currencyCode === "string"
  );
}

/**
 * Reads cached prices from sessionStorage. The storage object is
 * injectable so tests can pass a fake; defaults to window.sessionStorage
 * (null on the server, where this always returns null).
 */
export function readSessionPrices(
  countryCode: string | undefined,
  priceIds: string[],
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.sessionStorage
    : null
): PriceMap | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(
      buildClientPricesCacheKey(countryCode, priceIds)
    );
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as StoredPrices).savedAt !== "number" ||
      !isPriceMap((parsed as StoredPrices).prices)
    ) {
      return null;
    }
    if (Date.now() - (parsed as StoredPrices).savedAt > CLIENT_PRICES_TTL_MS) {
      return null;
    }
    return (parsed as StoredPrices).prices;
  } catch {
    return null;
  }
}

export function writeSessionPrices(
  countryCode: string | undefined,
  priceIds: string[],
  prices: PriceMap,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !== "undefined"
    ? window.sessionStorage
    : null
): void {
  if (!storage) return;
  try {
    const stored: StoredPrices = { savedAt: Date.now(), prices };
    storage.setItem(
      buildClientPricesCacheKey(countryCode, priceIds),
      JSON.stringify(stored)
    );
  } catch {
    // Quota / private mode — non-fatal, prices just won't be cached.
  }
}

/**
 * Fetches the server-side cached preview. Returns null on any failure
 * (route unavailable, 503, timeout, bad shape) — the caller falls back
 * to the client-side PricePreview. Never throws.
 */
export async function fetchServerPrices(
  countryCode: string | undefined,
  timeoutMs = 6_000
): Promise<PriceMap | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const query = countryCode
      ? `?country=${encodeURIComponent(countryCode)}`
      : "";
    const res = await fetch(`/api/pricing/preview${query}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return null;
    const prices = (body as { prices?: unknown }).prices;
    if (!isPriceMap(prices) || Object.keys(prices).length === 0) return null;
    return prices;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
