"use client";

/**
 * usePaddlePricing
 * ─────────────────
 * Shared hook used by PricingModal and the Settings billing tab.
 *
 * Mirrors the exact Paddle.js approach in PricingClient:
 *   1. Initialises Paddle.js with the env token.
 *   2. Calls Paddle.PricePreview() for all 12 price IDs (3 tiers × 4 intervals)
 *      once Paddle is ready — returns country-localised, already-formatted strings.
 *   3. Exposes Paddle.Checkout.open() via openCheckout(tier, interval, options).
 *
 * Prices are displayed verbatim from Paddle (e.g. "$9.00", "€8.50").
 * No manual currency formatting, no /api/billing/prices round-trip.
 *
 * Requires:
 *   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN   — live_ or sandbox_ token
 *   NEXT_PUBLIC_PADDLE_ENV            — "production" | "sandbox"
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Paddle, PaddleEventData } from "@paddle/paddle-js";
import type { SerializedTier, PricingInterval } from "@/lib/tiers";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormattedPrice {
  /** Paddle-formatted total for one billing cycle, e.g. "$9.00" */
  total: string;
  /** Per-month equivalent (same as total for monthly; computed for others) */
  perMonth: string;
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
  countryCode?: string
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
      console.error("[usePaddlePricing] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN or NEXT_PUBLIC_PADDLE_ENV is not set.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment: paddleEnv,
          token:       clientToken,
          eventCallback(event: PaddleEventData) {
            // Route checkout.completed to whatever callback was registered
            // at the time openCheckout was called.
            if (event.name === "checkout.completed") {
              onCompleteRef.current?.();
            }
          },
        });
        if (!cancelled && paddle) {
          paddleRef.current = paddle;
          setPaddleReady(true);
        }
      } catch (err) {
        console.error("[usePaddlePricing] Paddle init error:", err);
        if (!cancelled) setPaddleReady(true); // unblock UI
      }
    })();

    return () => { cancelled = true; };
  }, []); // run once

  // ── 2. Fetch localised prices via PricePreview ────────────────────────────
  useEffect(() => {
    if (!paddleReady || !paddleRef.current) return;
    if (tiers.length === 0) return;

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
              if (tier.priceId[iv] !== priceId) continue;

              const cycleTotal = lineItem.formattedTotals.total;

              // Compute per-month for multi-month intervals.
              let perMonth = cycleTotal;
              if (iv !== "month") {
                const rawSubtotal = parseFloat(lineItem.totals.subtotal) / 100;
                const perMonthRaw = rawSubtotal / MONTHS_IN_CYCLE[iv];
                const symbol      = extractCurrencySymbol(cycleTotal);
                perMonth = `${symbol}${perMonthRaw.toFixed(2)}`;
              }

              map[`${tier.id}_${iv}`] = {
                total:        cycleTotal,
                perMonth,
                currencyCode: response.data.currencyCode,
              };
            }
          }
        }

        setPrices(map);
        setPricesLoaded(true);
      } catch (err) {
        console.error("[usePaddlePricing] PricePreview error:", err);
      }
    })();

    return () => { cancelled = true; };
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
      const successUrl = opts.successUrl ?? `${siteUrl}/dashboard/settings?upgraded=1`;

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

  /** Billing cadence sub-label below the price. */
  function getBillingLabel(tierId: string, interval: PricingInterval): string {
    const cadenceMap: Record<PricingInterval, string> = {
      month:      "monthly",
      quarter:    "every 3 months",
      semiannual: "every 6 months",
      year:       "annually",
    };
    const savingMap: Record<PricingInterval, string> = {
      month:      "",
      quarter:    "save 10%",
      semiannual: "save 15%",
      year:       "save 20%",
    };

    if (interval === "month") return "billed monthly";

    const entry = prices[`${tierId}_${interval}`];
    if (!entry) return `billed ${cadenceMap[interval]}`;
    return `${entry.total} billed ${cadenceMap[interval]} · ${savingMap[interval]}`;
  }

  return {
    paddleReady,
    prices,
    pricesLoaded,
    openingTier,
    checkoutError,
    clearCheckoutError: () => setCheckoutError(null),
    openCheckout,
    getDisplayPrice,
    getBillingLabel,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractCurrencySymbol(formatted: string): string {
  const match = formatted.match(/^[^\d\s]+/);
  return match ? match[0] : "";
}
