/**
 * POST /api/webhooks/resend
 *
 * Resend delivery webhooks (Svix-signed). Correlates each event to the
 * campaign recipient by the Resend message id stored at send time
 * (Phase 1) and moves the recipient's derived status through the
 * transition table (Phase 2: src/lib/campaign-tracking.ts).
 *
 * Security contract (mirrors the Paddle webhook route)
 * ───────────────────────────────────────────────────
 * • The RAW request body is passed to Svix verification — never
 *   pre-parsed JSON.
 * • If RESEND_WEBHOOK_SECRET is not configured we return 503 — an
 *   unverified webhook is never accepted.
 * • If signature verification fails we return 401, NOT 2xx. A 2xx
 *   would tell Resend "delivery succeeded" and stop retries.
 * • Deliveries are at-least-once: the Svix delivery id dedups at the
 *   raw store, and the provider event id dedups at the MessageEvent
 *   log. A redelivery is acknowledged (200) without reprocessing.
 * • Handler errors return 500 so Resend retries; unknown message ids
 *   (sent before Phase 1, or test messages) are acknowledged (200) —
 *   test messages never count in campaign stats.
 *
 * Environment variables
 * ─────────────────────
 *   RESEND_WEBHOOK_SECRET — Svix signing secret from the Resend
 *     dashboard (Webhooks → endpoint → Signing Secret).
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/rate-limit";
import { verifySvixSignature } from "@/lib/webhook-verify";
import { processResendWebhook } from "@/lib/campaign-tracking";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const ok = verifySvixSignature({
    secret,
    svixId,
    svixTimestamp,
    svixSignature,
    rawBody,
  });
  if (!ok) {
    logger.warn("[Resend Webhook] Invalid Svix signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const rl = await withRateLimit(req, "standard", "webhook-resend");
  if (rl) return rl;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await processResendWebhook({
      payload,
      svixId: svixId ?? "",
    });
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    // 500 so Resend retries the delivery — the raw event is already
    // stored, so the retry dedups at the raw store and reprocesses.
    logger.error("[Resend Webhook] Processing failed", err);
    return NextResponse.json(
      { error: "processing_failed" },
      { status: 500 }
    );
  }
}
