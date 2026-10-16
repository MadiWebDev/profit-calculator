/**
 * Outbound webhooks — fan-out delivery for team events.
 *
 * Each delivery is signed with HMAC-SHA256 over the raw JSON body using the
 * subscription's secret. Signature header: `X-GPC-Signature: sha256=<hex>`,
 * plus `X-GPC-Event` with the event name and `X-GPC-Delivery` with a UUID
 * for idempotency on the receiver side.
 *
 * Delivery is best-effort with 3 attempts and exponential backoff
 * (1s, 4s). After the final failure the subscription records lastError;
 * subscriptions are NOT auto-disabled (a separate health view can do that).
 * Delivery never throws — callers fire and forget.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import {
  WebhookSubscriptionModel,
  type OutboundWebhookEvent,
} from "@/models/WebhookSubscription";

export type { OutboundWebhookEvent };
export { OUTBOUND_WEBHOOK_EVENTS } from "@/models/WebhookSubscription";

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;

export interface OutboundPayload {
  event: OutboundWebhookEvent;
  teamId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

function sign(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function deliverOnce(
  url: string,
  body: string,
  event: OutboundWebhookEvent,
  secret: string,
  deliveryId: string
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-GPC-Signature": sign(body, secret),
        "X-GPC-Event": event,
        "X-GPC-Delivery": deliveryId,
        "user-agent": "GetProfitCalc-Webhooks/1.0",
      },
      body,
      signal: controller.signal,
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fan out an event to every active subscription of the team listening for it.
 * Never throws.
 */
export async function emitOutboundWebhook(
  teamId: string | mongoose.Types.ObjectId,
  event: OutboundWebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await connectDB();
    const subs = await WebhookSubscriptionModel.find({
      teamId,
      active: true,
      events: event,
    }).lean();

    if (subs.length === 0) return;

    const payload: OutboundPayload = {
      event,
      teamId: teamId.toString(),
      occurredAt: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    await Promise.all(
      subs.map(async (sub) => {
        const deliveryId = crypto.randomUUID();
        let secret: string;
        try {
          secret = decrypt(sub.secret);
        } catch {
          logger.warn("outbound webhook: could not decrypt secret", {
            subscriptionId: sub._id.toString(),
          });
          return;
        }

        let ok = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
          ok = await deliverOnce(sub.url, body, event, secret, deliveryId);
          if (!ok && attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, attempt * attempt * 1000));
          }
        }

        await WebhookSubscriptionModel.updateOne(
          { _id: sub._id },
          ok
            ? { $set: { lastDeliveredAt: new Date() }, $unset: { lastError: 1 } }
            : { $set: { lastError: `Delivery failed after ${MAX_ATTEMPTS} attempts` } }
        );

        if (!ok) {
          logger.warn("outbound webhook: delivery failed", {
            subscriptionId: sub._id.toString(),
            event,
            url: sub.url,
          });
        }
      })
    );
  } catch (err) {
    logger.error(
      "outbound webhook: fan-out failed",
      err instanceof Error ? err : new Error("unknown"),
      { event }
    );
  }
}
