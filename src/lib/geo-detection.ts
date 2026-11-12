/**
 * Geo-detection cache — pure helpers for the location auto-detect in
 * src/components/dashboard/CurrencyContext.
 *
 * Everything in this module is network-free and side-effect-free so it
 * can be unit-tested without a browser.
 *
 * Why a TTL at all: the detected currency is cached in localStorage
 * (profit_detected_currency) so repeat visits don't re-fetch the geo
 * endpoint. But a detection frozen at first visit goes stale — a
 * traveller keeps their old country's currency as the default
 * forever, and a cached value from a VPN / proxy egress outlives the
 * session that produced it (the DZD case: a cached Algerian detection
 * kept showing while /api/geo/currency was answering US/USD). So a
 * cached detection is trusted only for DETECTED_CURRENCY_TTL_MS
 * (24 h); older entries — and entries written before this module
 * existed, which carry no timestamp — are treated as STALE: they do
 * not satisfy the provider's "already detected" guard, so the next
 * visit re-fetches the endpoint, and they are kept only as a
 * fail-open fallback if that re-fetch fails.
 *
 * The TTL applies to the DETECTED default only. A saved user
 * preference, a team setting, and an explicit browser choice are
 * never touched by this logic — they outrank detection in
 * resolveDisplayCurrency and the geo effect never runs while any of
 * them exists.
 */

/** A location auto-detect result: the currency + where it came from. */
export interface DetectedCurrency {
  /** ISO 4217 code, e.g. "PKR" */
  code: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "PK" — null when unknown (cached value from an older shape). */
  country: string | null;
  /** "vercel-geo" = Vercel country header, "language" = browser-language fallback. */
  source: "vercel-geo" | "language";
}

/** How long a cached detection is trusted before it must be re-fetched (24 h). */
export const DETECTED_CURRENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Serialize a fresh detection for localStorage, stamping it with the
 * moment it was recorded so a later visit can judge its age. `now`
 * exists for tests; callers should omit it.
 */
export function serializeDetected(d: DetectedCurrency, now: number = Date.now()): string {
  return JSON.stringify({ ...d, detectedAt: now });
}

/**
 * Parse a cached detection from localStorage and classify it.
 *
 * Returns `{ fresh, stale }` — exactly one of them is non-null when
 * the entry is usable, both null when it is garbage:
 *  - `fresh`: the code is a valid 3-letter code, the country field is
 *    present, and the entry was recorded within the TTL.
 *  - `stale`: the same, but the entry is older than the TTL — or it
 *    carries no timestamp at all (entries written before the TTL
 *    existed are stale by definition, so the first visit after this
 *    change re-fetches instead of trusting them).
 *
 * Shape-only code validation here; the provider still runs its
 * registry-membership check (normalizeSavedCurrency) on the result,
 * so a hand-edited or unknown code never selects a currency the
 * selector does not know.
 */
export function parseDetectedCache(
  raw: string | null,
  now: number = Date.now(),
): { fresh: DetectedCurrency | null; stale: DetectedCurrency | null } {
  const none = { fresh: null, stale: null };
  if (!raw) return none;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return none;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return none;
  const data = parsed as { code?: unknown; country?: unknown; source?: unknown; detectedAt?: unknown };
  if (typeof data.code !== "string") return none;
  const code = data.code.toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(code)) return none;
  // Country must be present (string or null); a missing field is a
  // shape we do not trust.
  if (data.country === undefined) return none;
  const country =
    typeof data.country === "string" ? data.country.toUpperCase().trim() || null : null;
  if (typeof data.country !== "string" && data.country !== null) return none;
  const detected: DetectedCurrency = {
    code,
    country,
    source: data.source === "language" ? "language" : "vercel-geo",
  };
  const detectedAt = data.detectedAt;
  const isFresh =
    typeof detectedAt === "number" &&
    Number.isFinite(detectedAt) &&
    now - detectedAt <= DETECTED_CURRENCY_TTL_MS;
  return isFresh ? { fresh: detected, stale: null } : { fresh: null, stale: detected };
}
