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
 * • Deliveries are at-least-once and may arrive out of order.
 *   All writes use upsert/findOneAndUpdate keyed on Paddle IDs — idempotent.
 *
 * Event routing
 * ─────────────
 * Handled:
 *   subscription.created   → upsert Subscription, propagate plan to Team + Users
 *   subscription.updated   → same as created (idempotent upsert)
 *   subscription.activated → same
 *   subscription.canceled  → mark status "cancelled"
 *   subscription.paused    → mark status "paused"
 *   subscription.resumed   → mark status "active"
 *   transaction.completed  → idempotent upsert from transaction payload (handles
 *                            first-payment race before subscription.created lands)
 *   transaction.payment_failed → mark status "past_due"
 *   customer.created       → store Paddle customerId on Team (by email lookup)
 *   customer.updated       → same
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
  TransactionCompletedEvent,
  TransactionPaymentFailedEvent,
  CustomerCreatedEvent,
  CustomerUpdatedEvent,
} from "@paddle/paddle-node-sdk";
import { getPaddleClient } from "@/lib/paddle";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { getAllPriceIds } from "@/lib/billing";
import type { PlanKey, BillingInterval } from "@/lib/billing";

// ── Price-ID → plan + interval reverse lookup ─────────────────────────────────

interface PlanEntry {
  plan: PlanKey;
  interval: BillingInterval;
}

function buildPriceMap(): Record<string, PlanEntry> {
  const allIds = getAllPriceIds(); // { "starter_monthly": "pri_xxx", … }
  const map: Record<string, PlanEntry> = {};

  for (const [key, priceId] of Object.entries(allIds)) {
    if (!priceId) continue;
    const [plan, interval] = key.split("_") as [PlanKey, BillingInterval];
    map[priceId] = { plan, interval };
  }
  return map;
}

function planFromPriceId(priceId: string): PlanEntry {
  const map = buildPriceMap();
  if (map[priceId]) return map[priceId];

  // Fallback — naive string match for safety
  const id = priceId.toLowerCase();
  const plan: PlanKey =
    id.includes("pro") ? "pro" : id.includes("growth") ? "growth" : "starter";
  const interval: BillingInterval =
    id.includes("semiannual") ? "semiannual" :
    id.includes("annual")     ? "annual"     :
    id.includes("quarterly")  ? "quarterly"  : "monthly";

  return { plan, interval };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

// ── Subscription event handler ────────────────────────────────────────────────

async function handleSubscriptionUpsert(
  data: SubscriptionCreatedEvent["data"] |
        SubscriptionUpdatedEvent["data"] |
        SubscriptionActivatedEvent["data"]
): Promise<void> {
  // custom_data carries the teamId we stamped on the transaction at checkout
  // CustomData is typed as Record<string, unknown> — cast to string map
  const customData = (data.customData ?? {}) as Record<string, string>;
  const teamId     = customData.teamId;

  if (!teamId) {
    console.warn("[webhook] subscription event missing teamId in custom_data — skipping");
    return;
  }

  const items   = data.items ?? [];
  // price is SubscriptionPriceNotification | null
  const priceId = items[0]?.price?.id ?? "";
  const { plan, interval } = planFromPriceId(priceId);

  const billingPeriod = data.currentBillingPeriod;

  // Map Paddle's SubscriptionStatus enum values to our internal string enum
  // Paddle uses "canceled" (one 'l'); our DB uses "cancelled" (two 'l')
  const rawStatus = String(data.status ?? "active");
  const statusMap: Record<string, string> = {
    active:    "active",
    trialing:  "trialing",
    past_due:  "past_due",
    paused:    "paused",
    canceled:  "cancelled",
    cancelled: "cancelled",
  };
  const status = statusMap[rawStatus] ?? rawStatus;

  // scheduledChange: set when a cancel/pause is pending for next billing date
  const scheduledChangeAction  = data.scheduledChange?.action  ? String(data.scheduledChange.action) : null;
  const scheduledChangeAt      = data.scheduledChange?.effectiveAt
    ? toDate(data.scheduledChange.effectiveAt)
    : null;

  await SubscriptionModel.findOneAndUpdate(
    { externalId: data.id },
    {
      $set: {
        teamId,
        gateway:              "paddle",
        externalId:           data.id,
        customerId:           data.customerId,
        plan,
        interval,
        status,
        priceId,
        currentPeriodStart:   billingPeriod?.startsAt ? toDate(billingPeriod.startsAt) : new Date(),
        currentPeriodEnd:     billingPeriod?.endsAt   ? toDate(billingPeriod.endsAt)   : new Date(),
        // cancelAtPeriodEnd is true only when a scheduled cancel is pending
        cancelAtPeriodEnd:    scheduledChangeAction === "cancel",
        scheduledChangeAction,
        scheduledChangeAt,
      },
    },
    { upsert: true, new: true }
  );

  // Propagate plan to Team and all team members
  await Promise.all([
    TeamModel.findByIdAndUpdate(teamId, {
      plan,
      subscriptionId: data.id,
      paddleCustomerId: data.customerId,
    }),
    UserModel.updateMany({ teamId }, { plan }),
  ]);

  console.log(
    `[webhook] subscription upserted: id=${data.id} team=${teamId} plan=${plan}/${interval} status=${status}`
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Read the RAW body — must not be JSON.parsed before unmarshal
  const rawBody = await req.text();

  const headersList = await headers();
  const signature   = headersList.get("paddle-signature") ?? "";

  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] PADDLE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // 2. Verify signature with Paddle SDK — this is the authoritative check.
  //    unmarshal is synchronous and throws (or returns null) if verification fails.
  let event;
  try {
    const paddle = getPaddleClient();
    event = paddle.webhooks.unmarshal(rawBody, secret, signature);
  } catch (err) {
    console.warn("[webhook] Paddle signature verification failed:", err);
    // Return 401 — not 2xx — so Paddle keeps retrying
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!event) {
    // Unmarshal returns undefined for unrecognised event shapes
    console.log("[webhook] Unrecognised event shape — ignoring");
    return NextResponse.json({ received: true });
  }

  await connectDB();

  // 3. Route to typed handlers ─────────────────────────────────────────────

  // ── subscription.created ──────────────────────────────────────────────────
  if (event.eventType === EventName.SubscriptionCreated) {
    const e = event as SubscriptionCreatedEvent;
    await handleSubscriptionUpsert(e.data);
    return NextResponse.json({ received: true });
  }

  // ── subscription.updated ──────────────────────────────────────────────────
  if (event.eventType === EventName.SubscriptionUpdated) {
    const e = event as SubscriptionUpdatedEvent;
    await handleSubscriptionUpsert(e.data);
    return NextResponse.json({ received: true });
  }

  // ── subscription.activated ────────────────────────────────────────────────
  if (event.eventType === EventName.SubscriptionActivated) {
    const e = event as SubscriptionActivatedEvent;
    await handleSubscriptionUpsert(e.data);
    return NextResponse.json({ received: true });
  }

  // ── subscription.canceled ─────────────────────────────────────────────────
  // Paddle spells it "canceled" (one 'l') in event names
  if (event.eventType === EventName.SubscriptionCanceled) {
    const e = event as SubscriptionCanceledEvent;
    const updated = await SubscriptionModel.findOneAndUpdate(
      { externalId: e.data.id },
      {
        $set: {
          status:            "cancelled",
          cancelledAt:       new Date(),
          cancelAtPeriodEnd: false,
        },
      }
    );
    if (!updated) {
      console.warn("[webhook] subscription.canceled — no matching sub for id:", e.data.id);
    } else {
      console.log("[webhook] subscription canceled:", e.data.id);
    }
    return NextResponse.json({ received: true });
  }

  // ── subscription.paused ───────────────────────────────────────────────────
  if (event.eventType === EventName.SubscriptionPaused) {
    const e = event as SubscriptionPausedEvent;
    await SubscriptionModel.findOneAndUpdate(
      { externalId: e.data.id },
      { $set: { status: "paused" } }
    );
    console.log("[webhook] subscription paused:", e.data.id);
    return NextResponse.json({ received: true });
  }

  // ── subscription.resumed ──────────────────────────────────────────────────
  if (event.eventType === EventName.SubscriptionResumed) {
    const e = event as SubscriptionResumedEvent;
    await SubscriptionModel.findOneAndUpdate(
      { externalId: e.data.id },
      { $set: { status: "active" } }
    );
    console.log("[webhook] subscription resumed:", e.data.id);
    return NextResponse.json({ received: true });
  }

  // ── transaction.completed ─────────────────────────────────────────────────
  // First-payment race: Paddle may fire transaction.completed before
  // subscription.created. We do a conservative upsert here so the team
  // gets provisioned immediately; subscription.created will overwrite cleanly.
  if (event.eventType === EventName.TransactionCompleted) {
    const e = event as TransactionCompletedEvent;
    const txData = e.data;

    const subscriptionId = txData.subscriptionId;
    const customData     = (txData.customData ?? {}) as Record<string, string>;
    const teamId         = customData.teamId;

    if (subscriptionId && teamId) {
      // items[0].price is PriceNotification | null
      const items   = txData.items ?? [];
      const priceId = items[0]?.price?.id ?? "";
      const { plan, interval } = planFromPriceId(priceId);

      // Only upsert if no subscription record exists yet (avoid overwriting
      // a more complete subscription.created payload)
      const existing = await SubscriptionModel.findOne({ externalId: subscriptionId });
      if (!existing) {
        await SubscriptionModel.findOneAndUpdate(
          { externalId: subscriptionId },
          {
            $set: {
              teamId,
              gateway:    "paddle",
              externalId: subscriptionId,
              customerId: txData.customerId ?? "",
              plan,
              interval,
              status:     "active",
              priceId,
            },
          },
          { upsert: true, new: true }
        );
        await Promise.all([
          TeamModel.findByIdAndUpdate(teamId, { plan, subscriptionId }),
          UserModel.updateMany({ teamId }, { plan }),
        ]);
        console.log("[webhook] transaction.completed provisioned team:", teamId, "plan:", plan);
      } else {
        console.log("[webhook] transaction.completed — subscription already exists, skipping upsert");
      }
    }

    return NextResponse.json({ received: true });
  }

  // ── transaction.payment_failed ────────────────────────────────────────────
  if (event.eventType === EventName.TransactionPaymentFailed) {
    const e              = event as TransactionPaymentFailedEvent;
    const subscriptionId = e.data.subscriptionId;

    if (subscriptionId) {
      await SubscriptionModel.findOneAndUpdate(
        { externalId: subscriptionId },
        { $set: { status: "past_due" } }
      );
      console.log("[webhook] payment failed — subscription marked past_due:", subscriptionId);
    }
    return NextResponse.json({ received: true });
  }

  // ── customer.created ──────────────────────────────────────────────────────
  // Store the Paddle customerId on the Team so the portal route can use it.
  if (event.eventType === EventName.CustomerCreated) {
    const e      = event as CustomerCreatedEvent;
    const email  = e.data.email;
    const custId = e.data.id;

    if (email && custId) {
      // Find user by email → get their teamId → stamp on Team
      const user = await UserModel.findOne({ email: email.toLowerCase() }).select("teamId").lean();
      if (user?.teamId) {
        await TeamModel.findByIdAndUpdate(user.teamId, { paddleCustomerId: custId });
        console.log("[webhook] customer.created — stored paddleCustomerId on team:", custId);
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── customer.updated ──────────────────────────────────────────────────────
  if (event.eventType === EventName.CustomerUpdated) {
    const e      = event as CustomerUpdatedEvent;
    const email  = e.data.email;
    const custId = e.data.id;

    if (email && custId) {
      const user = await UserModel.findOne({ email: email.toLowerCase() }).select("teamId").lean();
      if (user?.teamId) {
        await TeamModel.findByIdAndUpdate(user.teamId, { paddleCustomerId: custId });
        console.log("[webhook] customer.updated — refreshed paddleCustomerId on team:", custId);
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Unknown / safely ignored ──────────────────────────────────────────────
  console.log("[webhook] Unhandled event type:", event.eventType, "— acknowledged");
  return NextResponse.json({ received: true });
}
