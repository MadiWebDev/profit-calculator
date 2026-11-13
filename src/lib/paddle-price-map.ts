/**
 * paddle-price-map.ts — shared, pure price-map helpers (isomorphic).
 *
 * The SAME PriceMap shape and the SAME per-month math are used by:
 *   - the server-side cached preview (src/lib/paddle-pricing.ts, Node SDK)
 *   - the client-side fallback preview (PricingClient, usePaddlePricing,
 *     Paddle.js PricePreview)
 *
 * Both sides adapt their SDK's line items into the minimal
 * `PreviewLineItem` shape and call `buildPriceMap()` — so server and
 * client output agree exactly. This file has NO Node-only imports and
 * is safe to import from client components.
 */

import type { SerializedTier, PricingInterval } from "@/lib/tiers";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormattedPrice {
  /** Paddle-formatted total for one billing cycle, e.g. "$9.00" or "€8.50" */
  total: string;
  /** Paddle-formatted per-month equivalent (only meaningful for yearly) */
  perMonth: string;
  /** Raw currency code returned by Paddle, e.g. "USD" */
  currencyCode: string;
}

/** key: `${tierId}_${interval}` */
export type PriceMap = Record<string, FormattedPrice>;

/** Minimal line-item shape both Paddle SDKs are adapted into. */
export interface PreviewLineItem {
  /** Paddle price ID, e.g. "pri_01..." */
  priceId: string;
  /** Already-formatted cycle total from Paddle, e.g. "$9.00" */
  formattedTotal: string;
  /**
   * Raw subtotal in minor units as Paddle returns it, e.g. "900" for $9.00.
   * Used only to derive the per-month equivalent.
   */
  subtotalMinor: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MONTHS_IN_CYCLE: Record<PricingInterval, number> = {
  month: 1,
  quarter: 3,
  semiannual: 6,
  year: 12,
};

export const PRICING_INTERVALS: PricingInterval[] = [
  "month",
  "quarter",
  "semiannual",
  "year",
];

/** Bump when the cache-key format changes so old entries are never reused. */
export const PRICE_MAP_CACHE_VERSION = "v1";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the currency symbol/code from a Paddle-formatted price string
 * by stripping everything numeric (digits, decimal/thousands separators,
 * whitespace). Works for leading symbols ("$9.00" → "$") and trailing
 * ones ("9,00 €" → "€") alike.
 */
export function extractCurrencySymbol(formatted: string): string {
  return formatted.replace(/[\d.,\s]/g, "");
}

/**
 * Builds the `${tierId}_${interval}` → FormattedPrice map from a preview's
 * line items. Line items whose priceId matches no tier/interval are
 * ignored; tiers with no matching line item simply get no entry.
 *
 * Per-month equivalent: Paddle doesn't return one, so we divide the raw
 * subtotal (minor units → major) by the months in the cycle. Informational
 * only — shown as a sub-label. Monthly entries use the total as-is.
 */
export function buildPriceMap(
  tiers: SerializedTier[],
  lineItems: PreviewLineItem[],
  currencyCode: string
): PriceMap {
  const map: PriceMap = {};

  for (const lineItem of lineItems) {
    for (const tier of tiers) {
      for (const iv of PRICING_INTERVALS) {
        if (tier.priceId[iv] !== lineItem.priceId) continue;

        const key = `${tier.id}_${iv}`;
        const cycleTotal = lineItem.formattedTotal;

        let perMonth = cycleTotal; // default: same as total (monthly)
        if (iv !== "month") {
          const rawSubtotal = parseFloat(lineItem.subtotalMinor) / 100;
          const perMonthRaw = rawSubtotal / MONTHS_IN_CYCLE[iv];
          const symbol = extractCurrencySymbol(cycleTotal);
          perMonth = `${symbol}${perMonthRaw.toFixed(2)}`;
        }

        map[key] = {
          total: cycleTotal,
          perMonth,
          currencyCode,
        };
      }
    }
  }

  return map;
}

/**
 * Deterministic cache key for a preview: version + country + the 12 price
 * IDs in tier order. The price IDs are part of the key so a price-ID
 * change (new env) can never serve a map built from stale IDs.
 */
export function buildPriceCacheKey(
  countryCode: string | undefined,
  priceIds: string[]
): string {
  const country = countryCode ? countryCode.toUpperCase() : "AUTO";
  return `${PRICE_MAP_CACHE_VERSION}:${country}:${priceIds.join(",")}`;
}

/** All 12 price IDs in tier order (starter → growth → pro, month → year). */
export function allPriceIds(tiers: SerializedTier[]): string[] {
  return tiers.flatMap((t) => [
    t.priceId.month,
    t.priceId.quarter,
    t.priceId.semiannual,
    t.priceId.year,
  ]);
}
