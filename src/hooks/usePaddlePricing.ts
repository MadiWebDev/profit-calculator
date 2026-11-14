/**
 * usePaddlePricing
 * ────────────────
 * Shared hook encapsulating Paddle.js initialisation, price previews, and checkout.
 *
 * Approach:
 *   1. Initialises Paddle.js with the env token and pwCustomer for Paddle Retain.
 *   2. Fast path — prices first come from sessionStorage (repeat visits),
 *      then the server-side cached preview route (/api/pricing/preview),
 *      or from the `initialPrices` argument when the caller has one.
 *   3. Only when the fast path misses does it call Paddle.PricePreview()
 *      for all 12 price IDs (3 tiers × 4 intervals) once Paddle is ready —
 *      returns country-localised, already-formatted strings.
 *   4. Exposes Paddle.Checkout.open() via openCheckout(tier, interval, options).
 *   5. Performs instant checkout sync with /api/billing/sync on checkout.completed.
 *
 * Prices are displayed verbatim from Paddle (e.g. "$9.00", "€8.50").
 * We never format currencies manually on the client.
 *
 * Environment variables consumed:
 *   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN   — live_ or sandbox_ token
 *   NEXT_PUBLIC_PADDLE_ENV            — "production" | "sandbox"
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { SerializedTier, PricingInterval } from "@/lib/tiers";
import {
  allPriceIds,
  buildPriceMap,
  type PriceMap,
} from "@/lib/paddle-price-map";
import {
  fetchServerPrices,
  readSessionPrices,
  writeSessionPrices,
} from "@/lib/paddle-prices-client";
import {
  awaitPaddle,
  onPaddleCheckoutCompleted,
  warmPaddle,
} from "@/lib/paddle-init";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

// FormattedPrice / PriceMap live in @/lib/paddle-price-map — the SAME shape
// and per-month math the server-side preview uses, so server and client
// output agree exactly. Re-exported here so existing import sites keep
// working.
export type { FormattedPrice, PriceMap } from "@/lib/paddle-price-map";

export interface OpenCheckoutOptions {
  /** Signed-in user's email — prefills checkout */
  userEmail?: string;
  /** Team ID from JWT — stamped on Paddle customData for webhook provisioning */
  teamId?: string;
  /** URL Paddle redirects to after a successful payment */
  successUrl?: string;
  /** Called when checkout.completed fires */
  onComplete?: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePaddlePricing(
  tiers: SerializedTier[],
  countryCode?: string,
  paddleCustomerId?: string,
  /**
   * Server-side cached preview, when the caller already has one. When
   * present, prices are available immediately and no preview fetch runs.
   * Callers without one get the fast path below (session cache, then the
   * server preview route) instead.
   */
  initialPrices?: PriceMap
) {
  // Store the latest onComplete so the shared checkout.completed listener
  // can call it without needing to re-initialise Paddle on every
  // openCheckout call.
  const onCompleteRef = useRef<(() => void) | undefined>(undefined);

  // With server prices, the first paint already shows them — no skeleton.
  const [prices,       setPrices]       = useState<PriceMap>(initialPrices ?? {});
  const [pricesLoaded, setPricesLoaded] = useState(
    !!initialPrices && Object.keys(initialPrices).length > 0
  );
  // True once the fast path (session cache / server route) has been tried
  // and missed — only then is the slow client-side PricePreview allowed.
  const [serverPricesFailed, setServerPricesFailed] = useState(false);
  const [openingTier,  setOpeningTier]  = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Price IDs in tier order — the session-cache key input (stable per render).
  const priceIds = useMemo(() => allPriceIds(tiers), [tiers]);

  // ── 1. Paddle.js — shared singleton (@/lib/paddle-init) ─────────────────
  // The download + initialise starts at app level (PaddleWarmer in the
  // root layout), so it is usually done before the user gets here. This
  // effect only attaches the Retain customer id and registers the
  // post-checkout callback; checkout.completed sync is done once by the
  // singleton before this listener runs.
  useEffect(() => {
    warmPaddle(paddleCustomerId);
    return onPaddleCheckoutCompleted(() => {
      onCompleteRef.current?.();
    });
  }, [paddleCustomerId]);

  // ── 2. Fast path: session cache, then the server-side cached preview ────
  // Runs on mount, before Paddle.js has even downloaded. When it hits,
  // prices are already on screen and the slow client-side PricePreview
  // below never runs.
  useEffect(() => {
    if (pricesLoaded) return;

    let cancelled = false;

    (async () => {
      // Repeat visit / navigation: prices cached in this tab for ~1h.
      const cached = readSessionPrices(countryCode, priceIds);
      if (cached && Object.keys(cached).length > 0) {
        if (!cancelled) {
          setPrices(cached);
          setPricesLoaded(true);
        }
        return;
      }

      // Server-side cached preview (the route is CDN/server cached too).
      const serverPrices = await fetchServerPrices(countryCode);
      if (cancelled) return;
      if (serverPrices) {
        writeSessionPrices(countryCode, priceIds, serverPrices);
        setPrices(serverPrices);
        setPricesLoaded(true);
        return;
      }

      // No fast path available — allow the client-side PricePreview below.
      setServerPricesFailed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [countryCode, pricesLoaded, priceIds]);

  // ── 3. Fallback: prices via Paddle.js PricePreview ────────────────────────
  // Only runs when the fast path missed (no server prices). Waits for the
  // shared init instead of requiring a page-local Paddle instance.
  // Behaviour unchanged — one call for all 12 price IDs.
  useEffect(() => {
    if (!serverPricesFailed || pricesLoaded) return;

    let cancelled = false;

    (async () => {
      try {
        const paddle = await awaitPaddle();
        if (cancelled || !paddle) return;

        const items = tiers.flatMap((t) => [
          { priceId: t.priceId.month,      quantity: 1 },
          { priceId: t.priceId.quarter,    quantity: 1 },
          { priceId: t.priceId.semiannual, quantity: 1 },
          { priceId: t.priceId.year,       quantity: 1 },
        ]);

        const response = await paddle.PricePreview({
          items,
          ...(countryCode ? { address: { countryCode } } : {}),
        });

        if (cancelled) return;

        // Shared map builder — the same shape/math as the server preview.
        const map = buildPriceMap(
          tiers,
          response.data.details.lineItems.map((li) => ({
            priceId: li.price.id,
            formattedTotal: li.formattedTotals.total,
            subtotalMinor: li.totals.subtotal,
          })),
          response.data.currencyCode
        );

        writeSessionPrices(countryCode, priceIds, map);
        setPrices(map);
        setPricesLoaded(true);
      } catch (err) {
        logger.error("[usePaddlePricing] PricePreview error", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serverPricesFailed, pricesLoaded, tiers, countryCode, priceIds]);

  // ── 4. Open checkout ──────────────────────────────────────────────────────
  const openCheckout = useCallback(
    async (
      tier: SerializedTier,
      interval: PricingInterval,
      opts: OpenCheckoutOptions = {}
    ) => {
      const priceId    = tier.priceId[interval];
      const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      // Paddle requires an absolute success URL; a relative path is resolved
      // against the site URL so callers can simply pass "/dashboard".
      const successUrl = opts.successUrl
        ? (opts.successUrl.startsWith("http") ? opts.successUrl : `${siteUrl}${opts.successUrl}`)
        : `${siteUrl}/dashboard/settings?upgraded=1`;

      setOpeningTier(tier.id);
      setCheckoutError(null);

      try {
        // Wait for the shared init if it is still in flight (started at app
        // level, so usually already done) — a click in the first second
        // opens the overlay as soon as init lands instead of erroring.
        // Only a real failure / timeout shows an honest error.
        const paddle = await awaitPaddle();
        if (!paddle) {
          setCheckoutError("Paddle couldn't load. Please check your connection and try again.");
          return;
        }

        // Store the onComplete so the shared checkout.completed listener
        // can fire it.
        onCompleteRef.current = opts.onComplete;

        paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          settings: {
            displayMode: "overlay",
            variant:     "one-page",
            successUrl,
          },
          ...(opts.teamId    ? { customData: { teamId: opts.teamId } }    : {}),
          ...(opts.userEmail ? { customer:   { email: opts.userEmail } } : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not open checkout. Please try again.";
        setCheckoutError(msg);
      } finally {
        setOpeningTier(null);
      }
    },
    []
  );

  // ── Price helpers ─────────────────────────────────────────────────────────

  /** Paddle-formatted per-month price string for the selected interval. */
  function getDisplayPrice(tierId: string, interval: PricingInterval): string {
    const entry = prices[`${tierId}_${interval}`];
    if (!entry) return "—";
    return interval === "month" ? entry.total : entry.perMonth;
  }

  /** Interval billing description, e.g. "billed annually ($278.40/yr)". */
  function getBillingLabel(tierId: string, interval: PricingInterval): string | null {
    if (interval === "month") return null;
    const entry = prices[`${tierId}_${interval}`];
    if (!entry) return null;
    const labels: Record<PricingInterval, string> = {
      month:      "",
      quarter:    `billed quarterly (${entry.total}/qtr)`,
      semiannual: `billed every 6 months (${entry.total}/6mo)`,
      year:       `billed annually (${entry.total}/yr)`,
    };
    return labels[interval];
  }

  return {
    pricesLoaded,
    openingTier,
    checkoutError,
    clearCheckoutError: () => setCheckoutError(null),
    openCheckout,
    getDisplayPrice,
    getBillingLabel,
  };
}
