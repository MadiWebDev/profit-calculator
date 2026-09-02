import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { getGateway } from "@/lib/billing";
import type { PlanId } from "@/lib/plans";

// Maps gateway price IDs → plan names
function planFromPriceId(priceId: string): PlanId {
  const id = priceId.toLowerCase();
  if (id.includes("pro")) return "pro";
  if (id.includes("growth")) return "growth";
  if (id.includes("starter")) return "starter";
  return "starter";
}

/**
 * Verify Dodo Payments HMAC-SHA256 webhook signature.
 * Header format: "t=<timestamp>,v1=<hex-signature>"
 */
function verifyDodoSignature(body: string, header: string, secret: string): boolean {
  try {
    // Extract timestamp and signature from header
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
    const timestamp = parts["t"];
    const receivedSig = parts["v1"];
    if (!timestamp || !receivedSig) return false;

    // Reject if timestamp is older than 5 minutes (replay attack prevention)
    if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000) return false;

    const payload = `${timestamp}.${body}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    return timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSig));
  } catch {
    return false;
  }
}

/**
 * Verify Paddle HMAC-SHA256 webhook signature.
 * Header format: "ts=<timestamp>;h1=<hex-signature>"
 */
function verifyPaddleSignature(body: string, header: string, secret: string): boolean {
  try {
    const parts = Object.fromEntries(header.split(";").map((p) => p.split("=")));
    const timestamp = parts["ts"];
    const receivedSig = parts["h1"];
    if (!timestamp || !receivedSig) return false;

    // Reject replays older than 5 minutes
    if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000) return false;

    const payload = `${timestamp}:${body}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    return timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSig));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const gateway = getGateway();
  const body = await req.text();
  const headersList = await headers();

  // ── Dodo webhook ──────────────────────────────────────────────────────────
  if (gateway === "dodo") {
    const signature = headersList.get("dodo-signature") ?? "";
    const webhookSecret = process.env.DODO_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[webhook] DODO_WEBHOOK_SECRET is not set — cannot verify webhook signature");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    if (!verifyDodoSignature(body, signature, webhookSecret)) {
      console.warn("[webhook] Dodo signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: Record<string, unknown>;
    try { event = JSON.parse(body); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

    await connectDB();
    const type = event.type as string;

    if (type === "subscription.created" || type === "subscription.activated") {
      const data = event.data as Record<string, unknown>;
      const teamId = (data.metadata as Record<string, string>)?.teamId;
      if (!teamId) return NextResponse.json({ ok: true });

      const plan = planFromPriceId(String(data.price_id ?? ""));
      await SubscriptionModel.findOneAndUpdate(
        { teamId },
        {
          gateway: "dodo",
          externalId: String(data.id),
          customerId: String(data.customer_id),
          plan,
          status: "active",
          priceId: String(data.price_id),
          amount: Number(data.amount ?? 0),
          currency: String(data.currency ?? "USD"),
          currentPeriodStart: new Date(String(data.current_period_start ?? Date.now())),
          currentPeriodEnd: new Date(String(data.current_period_end ?? Date.now())),
        },
        { upsert: true, new: true }
      );
      await TeamModel.findByIdAndUpdate(teamId, { plan });
      await UserModel.updateMany({ teamId }, { plan });
    }

    if (type === "subscription.cancelled") {
      const data = event.data as Record<string, unknown>;
      await SubscriptionModel.findOneAndUpdate(
        { externalId: String(data.id) },
        { status: "cancelled", cancelledAt: new Date() }
      );
    }

    if (type === "payment.failed") {
      const data = event.data as Record<string, unknown>;
      await SubscriptionModel.findOneAndUpdate(
        { externalId: String(data.subscription_id) },
        { status: "past_due" }
      );
    }

    return NextResponse.json({ received: true });
  }

  // ── Paddle webhook ─────────────────────────────────────────────────────────
  const signature = headersList.get("paddle-signature") ?? "";
  const paddleSecret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!paddleSecret) {
    console.error("[webhook] PADDLE_WEBHOOK_SECRET is not set — cannot verify webhook signature");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  if (!verifyPaddleSignature(body, signature, paddleSecret)) {
    console.warn("[webhook] Paddle signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(body); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  await connectDB();
  const eventType = (event.event_type ?? event.type) as string;
  const data = event.data as Record<string, unknown>;

  if (eventType === "subscription.created" || eventType === "subscription.updated") {
    const customData = (data.custom_data ?? {}) as Record<string, string>;
    const teamId = customData.teamId;
    if (!teamId) return NextResponse.json({ ok: true });

    const items = (data.items as { price: { id: string } }[]) ?? [];
    const priceId = items[0]?.price?.id ?? "";
    const plan = planFromPriceId(priceId);

    await SubscriptionModel.findOneAndUpdate(
      { teamId },
      {
        gateway: "paddle",
        externalId: String(data.id),
        customerId: String(data.customer_id),
        plan,
        status: String(data.status ?? "active"),
        priceId,
        currentPeriodStart: new Date(String((data.current_billing_period as Record<string, unknown>)?.starts_at ?? Date.now())),
        currentPeriodEnd: new Date(String((data.current_billing_period as Record<string, unknown>)?.ends_at ?? Date.now())),
      },
      { upsert: true, new: true }
    );
    await TeamModel.findByIdAndUpdate(teamId, { plan });
    await UserModel.updateMany({ teamId }, { plan });
  }

  if (eventType === "subscription.cancelled") {
    await SubscriptionModel.findOneAndUpdate(
      { externalId: String(data.id) },
      { status: "cancelled", cancelledAt: new Date() }
    );
  }

  return NextResponse.json({ received: true });
}
