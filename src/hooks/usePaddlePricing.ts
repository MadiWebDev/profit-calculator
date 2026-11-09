/**
 * usePaddlePricing
 * ────────────────
 * Shared hook encapsulating Paddle.js initialisation, price previews, and checkout.
 *
 * Approach:
 *   1. Initialises Paddle.js with the env token and pwCustomer for Paddle Retain.
 *   2. Calls Paddle.PricePreview() for all 12 price IDs (3 tiers × 4 intervals)
 *      once Paddle is ready — returns country-localised, already-formatted strings.
 *   3. Exposes Paddle.Checkout.open() via openCheckout(tier, interval, options).
 *   4. Performs instant checkout sync with /api/billing/sync on checkout.completed.
 *
 * Prices are displayed verbatim from Paddle (e.g. "$9.00", "€8.50").
 * We never format currencies manually on the client.
 *
 * Environment variables consumed:
 *   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN   — live_ or sandbox_ token
 *   NEXT_PUBLIC_PADDLE_ENV            — "production" | "sandbox"
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Paddle, PaddleEventData } from "@paddle/paddle-js";
import type { SerializedTier, PricingInterval } from "@/lib/tiers";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormattedPrice {
  /** Paddle-formatted total for one billing cycle, e.g. "$9.00" */
  total: string;
  /** Paddle-formatted per-month equivalent */
  perMonth: string;
  /** ISO 4217 currency code returned by Paddle, e.g. "USD" */
  currencyCode: string;
}

export type PriceMap = Record<string, FormattedPrice>; // key: `${tierId}_${interval}`

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

// ── Months per interval ───────────────────────────────────────────────────────

const MONTHS_IN_CYCLE: Record<PricingInterval, number> = {
  month:      1,
  quarter:    3,
  semiannual: 6,
  year:       12,
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePaddlePricing(
  tiers: SerializedTier[],
  countryCode?: string,
  paddleCustomerId?: string
) {
  const paddleRef     = useRef<Paddle | null>(null);
  // Store the latest onComplete so the init-time eventCallback can call it
  // without needing to re-initialise Paddle on every openCheckout call.
  const onCompleteRef = useRef<(() => void) | undefined>(undefined);

  const [paddleReady,  setPaddleReady]  = useState(false);
  const [prices,       setPrices]       = useState<PriceMap>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [openingTier,  setOpeningTier]  = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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

  // ── 2. Fetch prices via PricePreview ──────────────────────────────────────
  useEffect(() => {
    if (!paddleReady || !paddleRef.current) return;

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

        const map: PriceMap = {};
        for (const lineItem of response.data.details.lineItems) {
          const priceId = lineItem.price.id;

          for (const tier of tiers) {
            for (const iv of ["month", "quarter", "semiannual", "year"] as PricingInterval[]) {
              if (tier.priceId[iv] === priceId) {
                const key = `${tier.id}_${iv}`;
                const cycleTotal = lineItem.formattedTotals.total;

                let perMonth = cycleTotal;
                if (iv !== "month") {
                  const rawSubtotal = parseFloat(lineItem.totals.subtotal) / 100;
                  const perMonthRaw = rawSubtotal / MONTHS_IN_CYCLE[iv];
                  const symbol = cycleTotal.replace(/[\d.,\s]/g, "");
                  perMonth = `${symbol}${perMonthRaw.toFixed(2)}`;
                }

                map[key] = {
                  total:        cycleTotal,
                  perMonth,
                  currencyCode: response.data.currencyCode,
                };
              }
            }
          }
        }

        setPrices(map);
        setPricesLoaded(true);
      } catch (err) {
        logger.error("[usePaddlePricing] PricePreview error", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paddleReady, tiers, countryCode]);

  // ── 3. Open checkout ──────────────────────────────────────────────────────
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
