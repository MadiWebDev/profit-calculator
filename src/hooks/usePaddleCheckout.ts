"use client";

/**
 * usePaddleCheckout
 * ─────────────────
 * Initialises Paddle.js once and provides helpers for:
 *   • openCheckout(plan, interval) — triggers Paddle checkout overlay or redirect
 *   • prices — live price map fetched from /api/billing/prices
 *   • getPrice(plan, interval) — resolved per-month display price in dollars
 *   • getTotalPrice(plan, interval) — total amount charged per cycle in dollars
 *
 * Paddle.js overlay is used when NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is set.
 * Falls back to full-page redirect otherwise.
 *
 * Supported intervals: monthly | quarterly | semiannual | annual
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Paddle } from "@paddle/paddle-js";
import { INTERVAL_META, PLAN_BASE_PRICES } from "@/lib/plans";
import type { BillingInterval, PlanKey } from "@/lib/billing";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceEntry {
  priceId: string;
  amountCents: number;
  currency: string;
  billingCycle: { interval: string; frequency: number } | null;
}

export type PricesMap = Record<string, PriceEntry>;   // key: "plan_interval"

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const USE_OVERLAY  = CLIENT_TOKEN.length > 0;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePaddleCheckout() {
  const paddleRef = useRef<Paddle | null>(null);

  // Overlay is "ready" immediately if we're using redirect mode
  const [ready,   setReady]   = useState(!USE_OVERLAY);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Live Paddle prices — populated from /api/billing/prices
  const [prices,       setPrices]       = useState<PricesMap>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // ── Fetch live prices from server ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/prices");
        if (!res.ok) return;
        const data: PricesMap = await res.json();
        if (!cancelled) {
          setPrices(data);
          setPricesLoaded(true);
        }
      } catch {
        // Non-fatal — UI falls back to static base prices
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Initialise Paddle.js overlay (only when token is present) ────────────
  useEffect(() => {
    if (!USE_OVERLAY) return;
    let cancelled = false;

    (async () => {
      try {
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment:
            process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
              ? "production"
              : "sandbox",
          token: CLIENT_TOKEN,
        });
        if (!cancelled && paddle) {
          paddleRef.current = paddle;
          setReady(true);
        }
      } catch (e) {
        console.error("[Paddle] init failed:", e);
        if (!cancelled) setReady(true); // fall through to redirect
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Price helpers ─────────────────────────────────────────────────────────

  /**
   * Per-month display price in dollars for a given plan + interval.
   * Uses live Paddle prices when available, otherwise falls back to
   * the static base prices with the interval discount applied.
   */
  const getPrice = useCallback(
    (plan: PlanKey, interval: BillingInterval): number => {
      const key   = `${plan}_${interval}`;
      const live  = prices[key];
      const meta  = INTERVAL_META[interval];

      if (live) {
        // live.amountCents is the total for one billing cycle (e.g. 3 months)
        return live.amountCents / 100 / meta.months;
      }

      // Static fallback
      const base     = PLAN_BASE_PRICES[plan] ?? 0;
      const discount = meta.discountPct / 100;
      return (base * (1 - discount)) / 100;
    },
    [prices]
  );

  /**
   * Total amount charged for one billing cycle in dollars.
   */
  const getTotalPrice = useCallback(
    (plan: PlanKey, interval: BillingInterval): number => {
      const key  = `${plan}_${interval}`;
      const live = prices[key];
      if (live) return live.amountCents / 100;

      const base     = PLAN_BASE_PRICES[plan] ?? 0;
      const meta     = INTERVAL_META[interval];
      const discount = meta.discountPct / 100;
      return (base * (1 - discount) * meta.months) / 100;
    },
    [prices]
  );

  /**
   * Currency code for a given plan + interval.
   * Defaults to "USD" when live prices are not yet loaded.
   */
  const getCurrency = useCallback(
    (plan: PlanKey, interval: BillingInterval): string =>
      prices[`${plan}_${interval}`]?.currency ?? "USD",
    [prices]
  );

  // ── Checkout ──────────────────────────────────────────────────────────────

  const openCheckout = useCallback(
    async (plan: PlanKey, interval: BillingInterval): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/billing/checkout", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ plan, interval }),
        });
        const json = await res.json();

        if (!res.ok || !json.url) {
          throw new Error(json.error ?? "Checkout unavailable. Please try again.");
        }

        const checkoutUrl: string = json.url;

        // Paddle.js overlay path — extract transaction ID from URL
        if (USE_OVERLAY && paddleRef.current) {
          const txnId = extractTransactionId(checkoutUrl);
          if (txnId) {
            paddleRef.current.Checkout.open({
              settings: {
                displayMode: "overlay",
                theme:       "light",
                locale:      "en",
              },
              transactionId: txnId,
            });
            return;
          }
          // Transaction ID not parseable — fall through to redirect
        }

        // Redirect fallback
        window.location.href = checkoutUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Checkout failed.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    openCheckout,
    ready,
    loading,
    error,
    clearError: () => setError(null),
    // Price data
    prices,
    pricesLoaded,
    getPrice,
    getTotalPrice,
    getCurrency,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Paddle hosted checkout URLs contain the transaction ID:
 *   https://checkout.paddle.com/checkout/custom/txn_xxxxx
 * Returns null if not found.
 */
function extractTransactionId(url: string): string | null {
  try {
    const match = url.match(/\/(txn_[a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
