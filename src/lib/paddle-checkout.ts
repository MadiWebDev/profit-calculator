/**
 * paddle-checkout.ts — hosted-checkout fallback + Paddle.js init hardening.
 * Isomorphic (no Node-only imports): used by PricingClient and
 * usePaddlePricing, and unit-tested in src/lib/__tests__/paddle-checkout.test.ts.
 *
 * Background: both checkout call sites used to show the dead-end
 * "Paddle is still loading. Please try again in a moment." whenever
 * `initializePaddle()` had not resolved — no timeout, no retry, no
 * fallback — even though the server-side hosted-checkout route
 * POST /api/billing/checkout existed and had zero callers. When
 * Paddle.js cannot initialise (blocked CDN, hung script, failed init),
 * checkout now falls back to that route and redirects the browser to
 * the hosted checkout URL Paddle returns.
 */

import type { BillingInterval, PlanKey } from "@/lib/billing";
import type { PricingInterval } from "@/lib/tiers";

/** How long one `initializePaddle()` attempt may run before it is abandoned. */
export const PADDLE_INIT_TIMEOUT_MS = 10_000;

/** Total init attempts: the first try + ONE retry. */
export const PADDLE_INIT_MAX_ATTEMPTS = 2;

/** Message shown while the hosted checkout is being opened. */
export const HOSTED_CHECKOUT_OPENING_MESSAGE = "Opening secure checkout…";

/** Message shown when the visitor has no team to attach a payment to. */
export const CHECKOUT_NEEDS_ACCOUNT_MESSAGE =
  "Please create a free account first, so we can activate your plan right after payment.";

// ── Interval mapping ─────────────────────────────────────────────────────────

/** Client `PricingInterval` → server `BillingInterval` (same cycle, other name). */
export function mapPricingIntervalToBillingInterval(
  interval: PricingInterval
): BillingInterval {
  switch (interval) {
    case "month":
      return "monthly";
    case "quarter":
      return "quarterly";
    case "semiannual":
      return "semiannual";
    case "year":
      return "annual";
  }
}

// ── Checkout-URL validation ──────────────────────────────────────────────────

/**
 * The success URL the hosted-checkout route redirects to after payment.
 * The client must never treat this URL as a checkout URL: the route used
 * to fall back to it when Paddle returned no checkout URL, which would
 * silently land a paying user on Settings without paying.
 */
export function checkoutSuccessUrl(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/dashboard/settings?upgraded=1`;
}

function normalizeUrlForCompare(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * True only for a real, absolute http(s) checkout URL that is NOT the
 * post-payment success URL. Rejects non-strings, relative URLs,
 * non-http(s) schemes (e.g. `javascript:`), and the success URL itself
 * (ignoring a trailing slash).
 */
export function isUsableCheckoutUrl(
  url: unknown,
  successUrl: string
): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (normalizeUrlForCompare(trimmed) === normalizeUrlForCompare(successUrl)) {
    return false;
  }
  return true;
}

/** Extracts and validates the checkout URL from a /api/billing/checkout body. */
export function resolveCheckoutUrl(body: unknown, successUrl: string): string | null {
  if (!body || typeof body !== "object") return null;
  const url = (body as { url?: unknown }).url;
  return isUsableCheckoutUrl(url, successUrl) ? (url as string) : null;
}

// ── Hosted-checkout request ──────────────────────────────────────────────────

/**
 * Opens a hosted checkout via the server route and returns Paddle's
 * checkout URL. Throws an honest, user-facing Error when anything goes
 * wrong — never resolves with a URL that is not a real checkout URL.
 * The caller redirects the browser to the returned URL.
 */
export async function requestHostedCheckout(
  plan: PlanKey,
  interval: BillingInterval
): Promise<{ url: string }> {
  let res: Response;
  try {
    res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, interval }),
    });
  } catch {
    throw new Error(
      "Could not reach the checkout server. Please check your connection and try again."
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body — fall through to the generic message below.
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Your session expired — please sign in again and try once more.");
    }
    const serverMessage = (body as { error?: unknown } | null)?.error;
    throw new Error(
      typeof serverMessage === "string" && serverMessage
        ? serverMessage
        : "Could not open checkout. Please try again."
    );
  }

  const url = resolveCheckoutUrl(body, checkoutSuccessUrl());
  if (!url) {
    throw new Error("Checkout could not be opened right now. Please try again.");
  }
  return { url };
}

// ── Init timeout + retry ─────────────────────────────────────────────────────

/** Races a promise against a timeout. The underlying work is NOT cancelled. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });
  // The race subscribes to `promise`, so a late rejection is handled and
  // never surfaces as an unhandled rejection.
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Runs `fn` with a per-attempt timeout, retrying once on failure or
 * timeout (two attempts total). Throws the last error when every attempt
 * fails. A timed-out attempt keeps running in the background — its late
 * result is simply ignored, which is safe for `initializePaddle()`.
 */
export async function initWithTimeoutAndRetry<T>(
  fn: () => Promise<T>,
  opts: { timeoutMs?: number; maxAttempts?: number; label?: string } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? PADDLE_INIT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? PADDLE_INIT_MAX_ATTEMPTS);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, opts.label ?? "Paddle initialisation");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
