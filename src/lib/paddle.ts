/**
 * paddle.ts — Paddle Node SDK singleton + access helper
 *
 * Usage:
 *   import { getPaddleClient, hasActiveAccess } from "@/lib/paddle";
 *
 * The SDK is initialised once and cached on the module scope.
 * Call getPaddleClient() wherever you need to call Paddle APIs or unmarshal webhooks.
 *
 * Environment variables required (server-side only):
 *   PADDLE_API_KEY               — Paddle live/sandbox secret key (pdl_live_…)
 *   PADDLE_WEBHOOK_SECRET        — Notification webhook signing secret (pdl_ntfset_…)
 *   NEXT_PUBLIC_PADDLE_ENV       — "production" | "sandbox"
 */

import { Paddle, Environment } from "@paddle/paddle-node-sdk";

// ── SDK singleton ─────────────────────────────────────────────────────────────

let _paddle: Paddle | null = null;

/**
 * Returns the singleton Paddle SDK client.
 * Throws if PADDLE_API_KEY is not set — fail fast, never silently swallow.
 */
export function getPaddleClient(): Paddle {
  if (_paddle) return _paddle;

  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[paddle] PADDLE_API_KEY is not set. Add it to your environment variables."
    );
  }

  const env =
    process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
      ? Environment.production
      : Environment.sandbox;

  _paddle = new Paddle(apiKey, { environment: env });
  return _paddle;
}

// ── Access helper ─────────────────────────────────────────────────────────────

/**
 * Subscription statuses that grant paid access to the application.
 *
 * Rules:
 *  - "active"   → full access
 *  - "trialing" → trial access (maps to active access in our app)
 *  - "past_due" → we grant a grace period (access continues until explicitly revoked)
 *
 * Statuses that do NOT grant access:
 *  - "cancelled" → access revoked (check currentPeriodEnd separately for grace)
 *  - "paused"    → access revoked
 *
 * A scheduled_change (cancel/pause pending) does NOT revoke access.
 * Only when the status field itself changes do we act.
 */
export const ACCESS_GRANTING_STATUSES = new Set<string>([
  "active",
  "trialing",
  "past_due", // grace period — treat as access-granting per project rules
]);

/**
 * Returns true if the given Paddle subscription status grants paid access.
 *
 * @param status  The `status` field from our Subscription document (mirrors Paddle).
 */
export function hasActiveAccess(status: string | undefined | null): boolean {
  if (!status) return false;
  return ACCESS_GRANTING_STATUSES.has(status);
}
