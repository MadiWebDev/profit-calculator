/**
 * POST /api/billing/webhook
 *
 * Receives Paddle webhook deliveries, verifies the signature with the Paddle
 * Node SDK (paddle.webhooks.unmarshal), and routes events to typed handlers.
 *
 * Security contract
 * ─────────────────
 * • The RAW request body is passed to unmarshal — never pre-parsed JSON.
 * • If signature verification fails we return 401, NOT 2xx.
 *   A 2xx would tell Paddle "delivery succeeded" and stop retries.
 *
 * Delivery contract (Phase 8)
 * ───────────────────────────
 * • Deliveries are at-least-once and may arrive out of order.
 * • Deduplication: every event is upserted into WebhookEvent by Paddle's
 *   event_id first. A repeat delivery finds the existing record and is
 *   acknowledged without reprocessing.
 * • Ordering: subscription writes carry the event's occurred_at and are only
 *   applied when newer than the subscription's lastEventAt. A stale
 *   subscription.updated arriving after subscription.canceled cannot
 *   resurrect the subscription.
 * • All writes use upsert/findOneAndUpdate keyed on Paddle IDs — idempotent.
 * • Handler errors are recorded on the WebhookEvent and returned as 500 so
 *   Paddle retries; signature failures return 401.
 *
 * Event routing
 * ─────────────
 * Handled:
 *   subscription.created/updated/activated → upsert Subscription, propagate
 *     plan to Team + Users
 *   subscription.canceled  → mark "cancelled", downgrade team to free
 *     immediately (the instant-cancel guarantee)
 *   subscription.paused    → mark "paused"
 *   subscription.resumed   → mark "active", restore team plan
 *   subscription.past_due  → mark "past_due" (same as payment_failed)
 *   transaction.completed / transaction.paid → idempotent provision from the
 *     transaction payload (handles first-payment race before
 *     subscription.created lands)
 *   transaction.payment_failed → mark "past_due" + dunning email (24h cooldown)
 *   customer.created / customer.updated → store Paddle customerId on Team
 *     (by email lookup)
 *
 * All other event types are acknowledged (200) and safely ignored.
 *
 * Environment variables
 * ─────────────────────
 *   PADDLE_WEBHOOK_SECRET   — Notification destination signing secret
 *   PADDLE_API_KEY          — Paddle API key (used by getPaddleClient)
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { EventName } from "@paddle/paddle-node-sdk";
import type {
  SubscriptionCreatedEvent,
  SubscriptionUpdatedEvent,
  SubscriptionCanceledEvent,
  SubscriptionPausedEvent,
  SubscriptionResumedEvent,
  SubscriptionActivatedEvent,
  SubscriptionPastDueEvent,
  TransactionCompletedEvent,
  TransactionPaidEvent,
  TransactionPaymentFailedEvent,
  CustomerCreatedEvent,
  CustomerUpdatedEvent,
  EventEntity,
} from "@paddle/paddle-node-sdk";
import { getPaddleClient } from "@/lib/paddle";
import { connectDB } from "@/lib/db";
import { logger } from "@/lib/logger";
import { claimWebhookEvent, finishWebhookEvent } from "@/lib/webhook-dedup";
import {
  handleSubscriptionUpsert,
  handleSubscriptionCanceled,
  handleSubscriptionPaused,
  handleSubscriptionResumed,
  handleTransactionCompleted,
  handlePaymentFailed,
  handleCustomerUpsert,
} from "@/lib/paddle-webhooks";

export async function POST(req: Request) {
  // 1. Read the RAW body — must not be JSON.parsed before unmarshal
  const rawBody = await req.text();

  const headersList = await headers();
  const signature   = headersList.get("paddle-signature") ?? "";

  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error(
      "paddle webhook: PADDLE_WEBHOOK_SECRET is not set",
      new Error("missing PADDLE_WEBHOOK_SECRET")
    );
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // 2. Verify signature with Paddle SDK — this is the authoritative check.
  //    unmarshal is synchronous and throws if verification fails.
  let event: EventEntity | null;
  try {
    const paddle = getPaddleClient();
    event = paddle.webhooks.unmarshal(rawBody, secret, signature);
  } catch {
    logger.warn("paddle webhook: signature verification failed");
    // Return 401 — not 2xx — so Paddle keeps retrying
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!event) {
    // Unmarshal returns null for unrecognised event shapes
    logger.info("paddle webhook: unrecognised event shape — ignoring");
    return NextResponse.json({ received: true });
  }

  await connectDB();

  const eventId    = event.eventId;
  const eventType  = String(event.eventType);
  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : undefined;

  // 3. Deduplication — at-least-once delivery means Paddle may resend.
  //    claimWebhookEvent() atomically decides: exactly one concurrent
  //    delivery processes; the rest are acknowledged as duplicates.
  const claim = await claimWebhookEvent({ eventId, source: "paddle", eventType, occurredAt });
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // 4. Route to typed handlers
  try {
    await routeEvent(event, occurredAt);
    await finishWebhookEvent(eventId, { status: "processed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error(
      "paddle webhook: handler failed",
      err instanceof Error ? err : new Error(message),
      { eventId, eventType }
    );
    await finishWebhookEvent(eventId, { status: "failed", error: message });
    // 500 so Paddle retries the delivery
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function routeEvent(event: EventEntity, occurredAt: Date | undefined): Promise<void> {
  const type = event.eventType;

  if (
    type === EventName.SubscriptionCreated ||
    type === EventName.SubscriptionUpdated ||
    type === EventName.SubscriptionActivated
  ) {
    const e = event as SubscriptionCreatedEvent | SubscriptionUpdatedEvent | SubscriptionActivatedEvent;
    await handleSubscriptionUpsert(e.data, occurredAt);
    return;
  }

  if (type === EventName.SubscriptionCanceled) {
    const e = event as SubscriptionCanceledEvent;
    await handleSubscriptionCanceled(e.data, occurredAt);
    return;
  }

  if (type === EventName.SubscriptionPaused) {
    const e = event as SubscriptionPausedEvent;
    await handleSubscriptionPaused(e.data, occurredAt);
    return;
  }

  if (type === EventName.SubscriptionResumed) {
    const e = event as SubscriptionResumedEvent;
    await handleSubscriptionResumed(e.data, occurredAt);
    return;
  }

  if (
    type === EventName.TransactionCompleted ||
    type === EventName.TransactionPaid
  ) {
    const e = event as TransactionCompletedEvent | TransactionPaidEvent;
    await handleTransactionCompleted(e.data, occurredAt);
    return;
  }

  if (type === EventName.TransactionPaymentFailed) {
    const e = event as TransactionPaymentFailedEvent;
    await handlePaymentFailed(e.data, occurredAt);
    return;
  }

  if (type === EventName.SubscriptionPastDue) {
    // subscription.past_due carries the subscription like other sub events;
    // route through the upsert so status/period stay in sync.
    const e = event as SubscriptionPastDueEvent;
    await handleSubscriptionUpsert(
      e.data as unknown as SubscriptionCreatedEvent["data"],
      occurredAt
    );
    return;
  }

  if (type === EventName.CustomerCreated || type === EventName.CustomerUpdated) {
    const e = event as CustomerCreatedEvent | CustomerUpdatedEvent;
    await handleCustomerUpsert(e.data);
    return;
  }

  logger.info("paddle webhook: unhandled event type — acknowledged", { eventType: String(type) });
}
