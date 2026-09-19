/**
 * POST /api/billing/portal
 *
 * Mints a Paddle customer portal session for the authenticated user and
 * returns the portal URL to redirect to. The portal is fully Paddle-hosted —
 * customers update payment methods, cancel, and view invoices there.
 *
 * Security
 * ────────
 * 1. User MUST be authenticated — 401 if no valid session.
 * 2. The Paddle customerId is resolved server-side from the session → DB.
 *    We NEVER trust a customerId supplied by the client.
 * 3. teamId comes from the JWT — never from the request body.
 *
 * Paddle REST API
 * ───────────────
 * POST /customers/{customer_id}/portal-sessions
 * Response: { data: { urls: { general: { overview: string }, subscriptions: [...] } } }
 * Docs: https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session
 *
 * Environment variables
 * ─────────────────────
 *   PADDLE_API_KEY          — Paddle live/sandbox secret key
 *   NEXT_PUBLIC_PADDLE_ENV  — "production" | "sandbox"
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import TeamModel from "@/models/Team";
import SubscriptionModel from "@/models/Subscription";

// ── Paddle REST helper ────────────────────────────────────────────────────────

const PADDLE_API_BASE =
  process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

async function paddleRequest(path: string, options: RequestInit = {}) {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("PADDLE_API_KEY is not set");

  const res = await fetch(`${PADDLE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paddle API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Authenticate — resolve teamId from the JWT session (never from request body)
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user   = session.user as { id?: string; teamId?: string; email?: string };
  const teamId = user.teamId;

  if (!teamId) {
    return NextResponse.json({ error: "No team found for this account" }, { status: 400 });
  }

  // 2. Resolve the Paddle customerId server-side from the DB
  await connectDB();

  const [team, sub] = await Promise.all([
    TeamModel.findById(teamId).select("paddleCustomerId name").lean(),
    SubscriptionModel.findOne({ teamId }).select("customerId externalId").lean(),
  ]);

  // Team.paddleCustomerId is populated by the customer.created/updated webhook.
  // Fall back to Subscription.customerId which is set by subscription.created.
  const paddleCustomerId: string =
    (team as { paddleCustomerId?: string } | null)?.paddleCustomerId ||
    sub?.customerId ||
    "";

  if (!paddleCustomerId) {
    return NextResponse.json(
      {
        error:
          "No Paddle customer found. Complete a checkout first before accessing the billing portal.",
      },
      { status: 404 }
    );
  }

  // 3. Parse optional subscriptionId from request body for a deep link
  let subscriptionIds: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.subscriptionId === "string" && body.subscriptionId) {
      subscriptionIds = [body.subscriptionId];
    }
  } catch {
    // non-fatal — subscriptionIds is optional
  }

  // If no explicit sub ID was passed, try to use the one from our DB
  if (subscriptionIds.length === 0 && sub?.externalId) {
    subscriptionIds = [sub.externalId];
  }

  // 4. Create portal session via Paddle REST API
  //    POST /customers/{customer_id}/portal-sessions
  //    Body: { subscription_ids: string[] }  — optional, for deep links
  try {
    const payload: { subscription_ids?: string[] } = {};
    if (subscriptionIds.length > 0) {
      payload.subscription_ids = subscriptionIds;
    }

    const json = await paddleRequest(
      `/customers/${paddleCustomerId}/portal-sessions`,
      {
        method: "POST",
        body:   JSON.stringify(payload),
      }
    );

    // The response shape:
    // { data: { urls: { general: { overview: string }, subscriptions: [...] } } }
    const portalUrl: string =
      json?.data?.urls?.general?.overview ??
      json?.data?.url ??
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard/settings`;

    return NextResponse.json({ url: portalUrl });
  } catch (err) {
    console.error("[portal] Failed to create Paddle portal session:", err);
    return NextResponse.json(
      { error: "Failed to create billing portal session. Please try again." },
      { status: 500 }
    );
  }
}
