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
import type { Paddle, PaddleEventData } from "@paddle/paddle-js";
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
  const paddleRef     = useRef<Paddle | null>(null);
  // Store the latest onComplete so the init-time eventCallback can call it
  // without needing to re-initialise Paddle on every openCheckout call.
  const onCompleteRef = useRef<(() => void) | undefined>(undefined);

  const [paddleReady,  setPaddleReady]  = useState(false);
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

  // ── 1. Initialise Paddle.js ───────────────────────────────────────────────
  useEffect(() => {
    const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const paddleEnv   = process.env.NEXT_PUBLIC_PADDLE_ENV as "production" | "sandbox" | undefined;

    if (!clientToken || !paddleEnv) {
      logger.error("[usePaddlePricing] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN or NEXT_PUBLIC_PADDLE_ENV is not set.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment: paddleEnv,
          token:       clientToken,
          // Paddle Retain: attach customer ID when signed in
          ...(paddleCustomerId ? { pwCustomer: { id: paddleCustomerId } } : {}),
          eventCallback(event: PaddleEventData) {
            if (event.name === "checkout.completed") {
              const eventData = event.data as Record<string, unknown> | undefined;
              const txId = (eventData?.transaction_id ?? eventData?.id) as string | undefined;

              if (txId) {
                // Instant sync with backend to eliminate webhook race condition
                fetch("/api/billing/sync", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ transactionId: txId }),
                })
                  .then(() => {
                    onCompleteRef.current?.();
                  })
                  .catch(() => {
                    onCompleteRef.current?.();
                  });
              } else {
                onCompleteRef.current?.();
              }
            }
          },
        });
        if (!cancelled && paddle) {
          paddleRef.current = paddle;
          setPaddleReady(true);
        }
      } catch (err) {
        logger.error("[usePaddlePricing] Paddle init error", err);
        if (!cancelled) setPaddleReady(true); // unblock UI
      }
    })();

    return () => {
      cancelled = true;
    };
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
  // Only runs when the fast path missed (no server prices) and Paddle.js
  // is ready. Behaviour unchanged — one call for all 12 price IDs.
  useEffect(() => {
    if (!serverPricesFailed || pricesLoaded || !paddleReady || !paddleRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const items = tiers.flatMap((t) => [
          { priceId: t.priceId.month,      quantity: 1 },
          { priceId: t.priceId.quarter,    quantity: 1 },
          { priceId: t.priceId.semiannual, quantity: 1 },
          { priceId: t.priceId.year,       quantity: 1 },
        ]);

        const response = await paddleRef.current!.PricePreview({
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
  }, [serverPricesFailed, pricesLoaded, paddleReady, tiers, countryCode, priceIds]);

  // ── 4. Open checkout ──────────────────────────────────────────────────────
  const openCheckout = useCallback(
    async (
      tier: SerializedTier,
      interval: PricingInterval,
      opts: OpenCheckoutOptions = {}
    ) => {
      if (!paddleRef.current) {
        setCheckoutError("Paddle is still loading. Please try again in a moment.");
        return;
      }

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
        // Store the onComplete so the init-time eventCallback can fire it.
        onCompleteRef.current = opts.onComplete;

        paddleRef.current.Checkout.open({
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
    paddleReady,
    pricesLoaded,
    openingTier,
    checkoutError,
    clearCheckoutError: () => setCheckoutError(null),
    openCheckout,
    getDisplayPrice,
    getBillingLabel,
  };
}
