/**
 * paddle-init — shared Paddle.js singleton
 * ────────────────────────────────────────
 * Problem: every subscribe surface (PricingClient, SettingsClient,
 * PricingModal) initialised Paddle.js on its own mount, so a user who
 * landed on a billing page and clicked Subscribe within ~1s hit
 * "Paddle is still loading" — the click errored instead of waiting.
 *
 * Fix: one module-level init promise, started as early as possible
 * (PaddleWarmer in the root layout) and shared across navigations.
 *   - warmPaddle() starts the download + initialise once; later calls
 *     reuse the in-flight promise and attach the Retain customer id
 *     via Paddle.Update() when it becomes known.
 *   - awaitPaddle() waits for the in-flight init (default 10s) instead
 *     of erroring instantly — a click while init is running opens the
 *     overlay as soon as init lands. Only a real failure / timeout
 *     returns null, and only then is an honest error shown.
 *   - The singleton owns the checkout.completed eventCallback: it runs
 *     the /api/billing/sync exactly once per completed checkout, then
 *     notifies registered listeners (each page keeps its own
 *     post-completion action — /welcome redirect, router.refresh() —
 *     via onPaddleCheckoutCompleted).
 *
 * SDK facts (verified against @paddle/paddle-js in node_modules):
 *   - loadFromCDN caches the script-load promise per version, and a
 *     second initializePaddle() call on an initialised instance calls
 *     paddle.Update(rest) instead of re-initialising — so re-calling
 *     initializePaddle with pwCustomer/eventCallback is safe.
 *   - The billing script is https://cdn.paddle.com/paddle/v2/paddle.js
 *     (PaddleBillingCDNUrl) — preconnect/preload in the root layout
 *     must match this exact URL.
 *   - A failed script load leaves the SDK's cached promise rejected,
 *     so a retry in the same page session fails fast without
 *     re-downloading; a page reload retries. warmPaddle() therefore
 *     resets its own promise on failure so callers can retry the
 *     (fast-failing) init instead of hanging on a stale rejection.
 *
 * Client-only: warmPaddle()/awaitPaddle() resolve null on the server.
 */

import type { Paddle, PaddleEventData } from "@paddle/paddle-js";
import { logger } from "@/lib/logger";

/** How long a Subscribe click waits for an in-flight init before giving up. */
export const PADDLE_INIT_TIMEOUT_MS = 10_000;

/** Resolves with the promise's value, or null if it doesn't settle in time. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  } catch {
    if (timer !== undefined) clearTimeout(timer);
    return Promise.resolve(null);
  }
}

type CheckoutCompletedListener = (
  data: Record<string, unknown> | undefined
) => void;

let paddlePromise: Promise<Paddle | null> | null = null;
let paddleInstance: Paddle | null = null;
const completedListeners = new Set<CheckoutCompletedListener>();

/**
 * Register a callback for checkout.completed. The singleton runs the
 * /api/billing/sync exactly once per event, then calls every listener.
 * Returns an unsubscribe function.
 */
export function onPaddleCheckoutCompleted(
  cb: CheckoutCompletedListener
): () => void {
  completedListeners.add(cb);
  return () => {
    completedListeners.delete(cb);
  };
}

function notifyCompleted(data: Record<string, unknown> | undefined): void {
  completedListeners.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      logger.error("[paddle-init] checkout.completed listener error", err);
    }
  });
}

/** Single eventCallback for the shared instance — sync once, then notify. */
function handlePaddleEvent(event: PaddleEventData): void {
  if (event.name !== "checkout.completed") return;
  const data = event.data as Record<string, unknown> | undefined;
  const txId = (data?.transaction_id ?? data?.id) as string | undefined;
  if (!txId) {
    notifyCompleted(data);
    return;
  }
  // Instant sync with the backend to eliminate the webhook race condition.
  fetch("/api/billing/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId: txId }),
  })
    .catch(() => undefined)
    .finally(() => notifyCompleted(data));
}

/** Attach the Paddle Retain customer id to an already-initialised instance. */
function attachCustomer(paddle: Paddle | null, paddleCustomerId: string): void {
  if (!paddle) return;
  try {
    paddle.Update({ pwCustomer: { id: paddleCustomerId } });
  } catch (err) {
    logger.error("[paddle-init] Paddle.Update(pwCustomer) failed", err);
  }
}

/**
 * Start (or reuse) the shared Paddle.js initialisation. Safe to call from
 * anywhere, any number of times — the script downloads once.
 */
export function warmPaddle(paddleCustomerId?: string): Promise<Paddle | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const paddleEnv = process.env
    .NEXT_PUBLIC_PADDLE_ENV as "production" | "sandbox" | undefined;

  if (!clientToken || !paddleEnv) {
    logger.error(
      "[paddle-init] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN or NEXT_PUBLIC_PADDLE_ENV is not set."
    );
    return Promise.resolve(null);
  }

  if (!paddlePromise) {
    paddlePromise = (async () => {
      try {
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment: paddleEnv,
          token: clientToken,
          ...(paddleCustomerId
            ? { pwCustomer: { id: paddleCustomerId } }
            : {}),
          eventCallback: handlePaddleEvent,
        });
        paddleInstance = paddle ?? null;
        return paddleInstance;
      } catch (err) {
        logger.error("[paddle-init] Paddle init error", err);
        // Let a later call retry instead of hanging on a stale rejection.
        paddlePromise = null;
        return null;
      }
    })();
  }

  if (paddleCustomerId) {
    if (paddleInstance) {
      attachCustomer(paddleInstance, paddleCustomerId);
    } else {
      // Init still in flight — attach the customer id when it lands.
      void paddlePromise.then((paddle) =>
        attachCustomer(paddle, paddleCustomerId)
      );
    }
  }

  return paddlePromise;
}

/** The initialised instance, or null if init hasn't completed yet. */
export function getPaddleInstance(): Paddle | null {
  return paddleInstance;
}

/**
 * Wait for Paddle.js to be ready. Returns the instance, or null when init
 * failed or didn't finish within `timeoutMs` (default 10s). Never throws.
 */
export async function awaitPaddle(
  timeoutMs: number = PADDLE_INIT_TIMEOUT_MS
): Promise<Paddle | null> {
  if (paddleInstance) return paddleInstance;
  try {
    return await withTimeout(warmPaddle(), timeoutMs);
  } catch {
    return null;
  }
}
