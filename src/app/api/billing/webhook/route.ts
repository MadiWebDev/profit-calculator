import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { getAllPriceIds } from "@/lib/billing";
import type { PlanKey, BillingInterval } from "@/lib/billing";

// ── Price ID → plan + interval lookup ────────────────────────────────────────

interface PlanIntervalEntry {
  plan: PlanKey;
  interval: BillingInterval;
}

/**
 * Build a reverse map of priceId → { plan, interval } at request time
 * so we correctly identify which plan was purchased regardless of the price
 * ID format (Paddle IDs are opaque strings like "pri_01abc123…").
 */
function buildPriceMap(): Record<string, PlanIntervalEntry> {
  const allIds = getAllPriceIds(); // { "starter_monthly": "pri_xxx", … }
  const map: Record<string, PlanIntervalEntry> = {};

  for (const [key, priceId] of Object.entries(allIds)) {
    if (!priceId) continue;
    const [plan, interval] = key.split("_") as [PlanKey, BillingInterval];
    map[priceId] = { plan, interval };
  }
  return map;
}

function planFromPriceId(priceId: string): PlanIntervalEntry {
  const map = buildPriceMap();
  if (map[priceId]) return map[priceId];

  // Fallback: naive string match for safety (catches custom IDs that include plan name)
  const id = priceId.toLowerCase();
  const plan: PlanKey         = id.includes("pro") ? "pro" : id.includes("growth") ? "growth" : "starter";
  const interval: BillingInterval =
    id.includes("semiannual") ? "semiannual" :
    id.includes("annual")     ? "annual"     :
    id.includes("quarterly")  ? "quarterly"  : "monthly";

  return { plan, interval };
}

// ── Paddle HMAC-SHA256 webhook signature verification ─────────────────────────
//
// Paddle sends: Paddle-Signature: ts=<unix_ts>;h1=<hex_hmac>
// Signed payload: "<ts>:<raw_body>"
// Algorithm: HMAC-SHA256 with PADDLE_WEBHOOK_SECRET

function verifyPaddleSignature(body: string, header: string, secret: string): boolean {
  try {
    const parts = Object.fromEntries(
      header.split(";").map((p) => {
        const eq = p.indexOf("=");
        return [p.slice(0, eq), p.slice(eq + 1)];
      })
    );
    const timestamp   = parts["ts"];
    const receivedSig = parts["h1"];
    if (!timestamp || !receivedSig) return false;

    // Reject replays older than 5 minutes
    const age = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (age > 5 * 60 * 1000) {
      console.warn("[webhook] Rejected — timestamp too old:", age, "ms");
      return false;
    }

    const payload  = `${timestamp}:${body}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");

    // Constant-time comparison to prevent timing attacks
    const a = Buffer.from(expected,     "hex");
    const b = Buffer.from(receivedSig,  "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (err) {
    console.error("[webhook] Signature verification threw:", err);
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body        = await req.text();
  const headersList = await headers();

  const signature    = headersList.get("paddle-signature") ?? "";
  const paddleSecret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!paddleSecret) {
    console.error("[webhook] PADDLE_WEBHOOK_SECRET is not set — cannot verify webhook");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  if (!verifyPaddleSignature(body, signature, paddleSecret)) {
    console.warn("[webhook] Paddle signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  await connectDB();

  const eventType = (event.event_type ?? event.type) as string;
  const data      = (event.data ?? {}) as Record<string, unknown>;

  // ── subscription.created / subscription.updated ──────────────────────────
  if (
    eventType === "subscription.created" ||
    eventType === "subscription.updated" ||
    eventType === "subscription.activated"
  ) {
    const customData = ((data.custom_data ?? data.customData ?? {}) as Record<string, string>);
    const teamId     = customData.teamId;

    if (!teamId) {
      console.warn("[webhook] subscription event missing teamId in custom_data");
      return NextResponse.json({ ok: true });
    }

    const items   = (data.items as { price: { id: string } }[]) ?? [];
    const priceId = items[0]?.price?.id ?? "";
    const { plan, interval } = planFromPriceId(priceId);

    const billingPeriod = (data.current_billing_period ?? {}) as Record<string, string>;

    await SubscriptionModel.findOneAndUpdate(
      { teamId },
      {
        gateway:             "paddle",
        externalId:          String(data.id ?? ""),
        customerId:          String(data.customer_id ?? ""),
        plan,
        interval,
        status:              String(data.status ?? "active"),
        priceId,
        currentPeriodStart:  new Date(billingPeriod.starts_at ?? Date.now()),
        currentPeriodEnd:    new Date(billingPeriod.ends_at   ?? Date.now()),
        cancelAtPeriodEnd:   data.scheduled_change != null,
      },
      { upsert: true, new: true }
    );

    await TeamModel.findByIdAndUpdate(teamId, { plan });
    await UserModel.updateMany({ teamId }, { plan });

    console.log(`[webhook] ${eventType}: team=${teamId} plan=${plan} interval=${interval}`);
    return NextResponse.json({ received: true });
  }

  // ── subscription.cancelled ───────────────────────────────────────────────
  if (eventType === "subscription.cancelled") {
    const updated = await SubscriptionModel.findOneAndUpdate(
      { externalId: String(data.id ?? "") },
      { status: "cancelled", cancelledAt: new Date(), cancelAtPeriodEnd: false }
    );
    if (!updated) {
      console.warn("[webhook] subscription.cancelled — no matching subscription for id:", data.id);
    }
    return NextResponse.json({ received: true });
  }

  // ── subscription.paused ──────────────────────────────────────────────────
  if (eventType === "subscription.paused") {
    await SubscriptionModel.findOneAndUpdate(
      { externalId: String(data.id ?? "") },
      { status: "paused" }
    );
    return NextResponse.json({ received: true });
  }

  // ── subscription.resumed ─────────────────────────────────────────────────
  if (eventType === "subscription.resumed") {
    await SubscriptionModel.findOneAndUpdate(
      { externalId: String(data.id ?? "") },
      { status: "active" }
    );
    return NextResponse.json({ received: true });
  }

  // ── transaction.payment_failed ───────────────────────────────────────────
  if (eventType === "transaction.payment_failed") {
    const subscriptionId = data.subscription_id as string | undefined;
    if (subscriptionId) {
      await SubscriptionModel.findOneAndUpdate(
        { externalId: subscriptionId },
        { status: "past_due" }
      );
    }
    return NextResponse.json({ received: true });
  }

  // ── transaction.completed (one-off charge or first payment) ─────────────
  if (eventType === "transaction.completed") {
    // Already handled via subscription.created in most cases.
    // Log and acknowledge so Paddle doesn't retry.
    console.log("[webhook] transaction.completed acknowledged");
    return NextResponse.json({ received: true });
  }

  // Unknown event — acknowledge so Paddle doesn't retry
  console.log(`[webhook] Unhandled Paddle event: ${eventType}`);
  return NextResponse.json({ received: true });
}
