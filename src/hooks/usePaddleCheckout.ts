"use client";

/**
 * usePaddleCheckout
 * ─────────────────
 * Initialises Paddle.js once and provides an `openCheckout` helper that:
 *  1. Calls POST /api/billing/checkout to get a transaction/checkout URL.
 *  2. If PAYMENT_GATEWAY=paddle and NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is set,
 *     opens the Paddle.js inline overlay (no page redirect).
 *  3. Otherwise falls back to a full page redirect to the returned URL.
 *
 * Usage:
 *   const { openCheckout, ready, loading, error } = usePaddleCheckout();
 *   await openCheckout("growth", "monthly");
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Paddle } from "@paddle/paddle-js";

type PlanKey  = "starter" | "growth" | "pro";
type Interval = "monthly" | "annual";

const CLIENT_TOKEN  = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const IS_PADDLE     = process.env.NEXT_PUBLIC_PAYMENT_GATEWAY === "paddle";
const USE_OVERLAY   = IS_PADDLE && CLIENT_TOKEN.length > 0;

export function usePaddleCheckout() {
  const paddleRef  = useRef<Paddle | null>(null);
  const [ready,    setReady]   = useState(!USE_OVERLAY); // redirect path is always "ready"
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState<string | null>(null);

  // Initialise Paddle.js only when overlay mode is active
  useEffect(() => {
    if (!USE_OVERLAY) return;
    let cancelled = false;

    (async () => {
      try {
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment: process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
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
        // Fall back to redirect on init failure — ready stays false until this,
        // but we set it true so openCheckout can still redirect.
        if (!cancelled) setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const openCheckout = useCallback(
    async (plan: PlanKey, interval: Interval): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        // 1 — Ask the server to create a transaction and get the checkout URL
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, interval }),
        });
        const json = await res.json();

        if (!res.ok || !json.url) {
          throw new Error(json.error ?? "Checkout unavailable. Please try again.");
        }

        const checkoutUrl: string = json.url;

        // 2a — Paddle.js overlay path
        if (USE_OVERLAY && paddleRef.current) {
          const txnId = extractTransactionId(checkoutUrl);
          if (txnId) {
            // Open the overlay using the transaction ID extracted from the URL
            paddleRef.current.Checkout.open({
              settings: {
                displayMode: "overlay",
                theme: "light",
                locale: "en",
              },
              transactionId: txnId,
            });
            return;
          }
          // No transaction ID parseable — fall through to redirect below
        }

        // 2b — Redirect fallback (Dodo or Paddle without overlay token)
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

  return { openCheckout, ready, loading, error, clearError: () => setError(null) };
}

/**
 * Paddle hosted checkout URLs look like:
 *   https://checkout.paddle.com/checkout/custom/txn_xxxxx
 * or
 *   https://buy.paddle.com/checkout/txn_xxxxx
 *
 * Extract the transaction ID so we can pass it to the JS overlay.
 * Returns null if the URL doesn't contain a recognisable transaction ID.
 */
function extractTransactionId(url: string): string | null {
  try {
    const match = url.match(/\/(txn_[a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
