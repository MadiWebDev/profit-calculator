/**
 * Billing abstraction layer — switches between Dodo Payments and Paddle
 * based on PAYMENT_GATEWAY env var ("dodo" | "paddle").
 */

export type BillingGateway = "dodo" | "paddle";

export function getGateway(): BillingGateway {
  const gw = process.env.PAYMENT_GATEWAY;
  if (gw === "paddle") return "paddle";
  return "dodo"; // default
}

// ── Price ID helpers ─────────────────────────────────────────────────────────

type PlanKey = "starter" | "growth" | "pro";
type Interval = "monthly" | "annual";

export function getPriceId(plan: PlanKey, interval: Interval): string {
  const gw = getGateway();

  if (gw === "paddle") {
    const map: Record<PlanKey, Record<Interval, string>> = {
      starter: {
        monthly: process.env.NEXT_PUBLIC_PADDLE_STARTER_PRICE_ID ?? "",
        annual: process.env.NEXT_PUBLIC_PADDLE_STARTER_PRICE_ID ?? "",
      },
      growth: {
        monthly: process.env.NEXT_PUBLIC_PADDLE_GROWTH_PRICE_ID ?? "",
        annual: process.env.NEXT_PUBLIC_PADDLE_GROWTH_PRICE_ID ?? "",
      },
      pro: {
        monthly: process.env.NEXT_PUBLIC_PADDLE_PRO_PRICE_ID ?? "",
        annual: process.env.NEXT_PUBLIC_PADDLE_PRO_PRICE_ID ?? "",
      },
    };
    return map[plan][interval];
  }

  // Dodo
  const map: Record<PlanKey, Record<Interval, string>> = {
    starter: {
      monthly: process.env.NEXT_PUBLIC_DODO_STARTER_PRICE_ID ?? "",
      annual: process.env.NEXT_PUBLIC_DODO_STARTER_ANNUAL_PRICE_ID ?? "",
    },
    growth: {
      monthly: process.env.NEXT_PUBLIC_DODO_GROWTH_PRICE_ID ?? "",
      annual: process.env.NEXT_PUBLIC_DODO_GROWTH_ANNUAL_PRICE_ID ?? "",
    },
    pro: {
      monthly: process.env.NEXT_PUBLIC_DODO_PRO_PRICE_ID ?? "",
      annual: process.env.NEXT_PUBLIC_DODO_PRO_ANNUAL_PRICE_ID ?? "",
    },
  };
  return map[plan][interval];
}

// ── Dodo Payments API helpers ─────────────────────────────────────────────────

const DODO_API_BASE = "https://api.dodopayments.com/v1";

async function dodoRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${DODO_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.DODO_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dodo API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function dodoCreateCheckout({
  priceId,
  customerEmail,
  customerName,
  teamId,
  successUrl,
  cancelUrl,
}: {
  priceId: string;
  customerEmail: string;
  customerName: string;
  teamId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return dodoRequest("/checkout/sessions", {
    method: "POST",
    body: JSON.stringify({
      price_id: priceId,
      customer: { email: customerEmail, name: customerName },
      metadata: { teamId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });
}

export async function dodoCancelSubscription(subscriptionId: string) {
  return dodoRequest(`/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
}

export async function dodoGetSubscription(subscriptionId: string) {
  return dodoRequest(`/subscriptions/${subscriptionId}`);
}

// ── Paddle API helpers ────────────────────────────────────────────────────────

const PADDLE_API_BASE = "https://api.paddle.com";

async function paddleRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${PADDLE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
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

export async function paddleCreateCheckout({
  priceId,
  customerEmail,
  teamId,
  successUrl,
}: {
  priceId: string;
  customerEmail: string;
  teamId: string;
  successUrl: string;
}) {
  return paddleRequest("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      customer: { email: customerEmail },
      custom_data: { teamId },
      checkout: { url: successUrl },
    }),
  });
}

export async function paddleCancelSubscription(subscriptionId: string) {
  return paddleRequest(`/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
}
