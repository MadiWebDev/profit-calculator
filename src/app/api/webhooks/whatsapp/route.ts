/**
 * /api/webhooks/whatsapp
 *
 * Meta WhatsApp status webhooks: delivery/read/failed updates for
 * template messages sent by campaigns. Correlates each status to the
 * campaign recipient by the Meta wamid stored at send time (Phase 1)
 * and moves the recipient's derived status through the transition
 * table (Phase 2: src/lib/campaign-tracking.ts).
 *
 * GET — the Meta verification handshake. Meta calls this once when the
 * webhook URL is registered (and whenever the subscription is
 * re-verified): `?hub.mode=subscribe&hub.verify_token=<the token you
 * entered in the Meta dashboard>&hub.challenge=<random>`. The challenge
 * is echoed back as plain text only when the token matches
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN.
 *
 * POST — status deliveries. Security contract (mirrors the Paddle
 * webhook route and the Meta deauthorize route):
 * • The RAW request body is passed to the HMAC check — never
 *   pre-parsed JSON.
 * • `X-Hub-Signature-256: sha256=<hex>` is HMAC-SHA256 of the raw body
 *   with META_APP_SECRET, compared with timingSafeEqual.
 * • If META_APP_SECRET is not configured we return 503 — an
 *   unverified webhook is never accepted.
 * • A bad signature returns 401, NOT 2xx. A 2xx would tell Meta
 *   "delivery succeeded" and stop retries.
 * • Deliveries are at-least-once: Meta sends no delivery id, so the
 *   raw store is keyed by a sha256 of the raw body — an exact
 *   redelivery is acknowledged (200) without reprocessing, and each
 *   status is deduped again at the MessageEvent log.
 * • Inbound messages (`value.messages`) are not consumed anywhere and
 *   are ignored. Unknown wamids (sent before Phase 1, or test
 *   messages) are acknowledged (200) — test messages never count in
 *   campaign stats.
 * • Handler errors return 500 so Meta retries.
 *
 * Environment variables
 * ─────────────────────
 *   META_APP_SECRET              — HMAC key for X-Hub-Signature-256
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN — the verify token entered in the
 *     Meta App dashboard when registering this webhook URL
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/rate-limit";
import { verifyMetaSignature } from "@/lib/webhook-verify";
import { processWhatsappWebhook } from "@/lib/campaign-tracking";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    mode === "subscribe" &&
    challenge !== null &&
    verifyToken &&
    token === verifyToken
  ) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  const ok = verifyMetaSignature({
    appSecret,
    signatureHeader: req.headers.get("X-Hub-Signature-256"),
    rawBody,
  });
  if (!ok) {
    logger.warn("[WhatsApp Webhook] Invalid X-Hub-Signature-256");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const rl = await withRateLimit(req, "standard", "webhook-whatsapp");
  if (rl) return rl;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Meta sends no per-delivery id: the raw store is keyed by a hash of
  // the exact body, so an identical redelivery dedups.
  const deliveryId = `whatsapp:${crypto
    .createHash("sha256")
    .update(rawBody, "utf8")
    .digest("hex")}`;

  try {
    const result = await processWhatsappWebhook({ payload, deliveryId });
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    logger.error("[WhatsApp Webhook] Processing failed", err);
    return NextResponse.json(
      { error: "processing_failed" },
      { status: 500 }
    );
  }
}
