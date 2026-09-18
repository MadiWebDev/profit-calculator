/**
 * Billing — Paddle only.
 *
 * All checkout, cancellation, and subscription management goes through Paddle.
 * Price IDs for each plan × interval combination are read from environment
 * variables (12 total: 3 plans × 4 intervals).
 *
 * Environment variables expected (server-side):
 *   PADDLE_API_KEY               — Paddle API secret key
 *   PADDLE_WEBHOOK_SECRET        — HMAC secret for webhook verification
 *
 * Price ID env vars (NEXT_PUBLIC_ so the client can also reference them):
 *   NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_STARTER_QUARTERLY_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_STARTER_SEMIANNUAL_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_GROWTH_MONTHLY_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_GROWTH_QUARTERLY_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_GROWTH_SEMIANNUAL_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_GROWTH_ANNUAL_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_PRO_QUARTERLY_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_PRO_SEMIANNUAL_PRICE_ID
 *   NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID
 */

export type PlanKey = "starter" | "growth" | "pro";
export type BillingInterval = "monthly" | "quarterly" | "semiannual" | "annual";

// ── Price ID helpers ─────────────────────────────────────────────────────────

const PRICE_ID_MAP: Record<PlanKey, Record<BillingInterval, string>> = {
  starter: {
    monthly:    process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID    ?? "",
    quarterly:  process.env.NEXT_PUBLIC_PADDLE_STARTER_QUARTERLY_PRICE_ID  ?? "",
    semiannual: process.env.NEXT_PUBLIC_PADDLE_STARTER_SEMIANNUAL_PRICE_ID ?? "",
    annual:     process.env.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID     ?? "",
  },
  growth: {
    monthly:    process.env.NEXT_PUBLIC_PADDLE_GROWTH_MONTHLY_PRICE_ID    ?? "",
    quarterly:  process.env.NEXT_PUBLIC_PADDLE_GROWTH_QUARTERLY_PRICE_ID  ?? "",
    semiannual: process.env.NEXT_PUBLIC_PADDLE_GROWTH_SEMIANNUAL_PRICE_ID ?? "",
    annual:     process.env.NEXT_PUBLIC_PADDLE_GROWTH_ANNUAL_PRICE_ID     ?? "",
  },
  pro: {
    monthly:    process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID    ?? "",
    quarterly:  process.env.NEXT_PUBLIC_PADDLE_PRO_QUARTERLY_PRICE_ID  ?? "",
    semiannual: process.env.NEXT_PUBLIC_PADDLE_PRO_SEMIANNUAL_PRICE_ID ?? "",
    annual:     process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID     ?? "",
  },
};

export function getPriceId(plan: PlanKey, interval: BillingInterval): string {
  return PRICE_ID_MAP[plan][interval] ?? "";
}

/**
 * Returns all 12 price IDs keyed by "plan_interval".
 * Useful for server-side price lookup tables.
 */
export function getAllPriceIds(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const plan of ["starter", "growth", "pro"] as PlanKey[]) {
    for (const interval of ["monthly", "quarterly", "semiannual", "annual"] as BillingInterval[]) {
      result[`${plan}_${interval}`] = PRICE_ID_MAP[plan][interval];
    }
  }
  return result;
}

// ── Paddle REST API helpers ───────────────────────────────────────────────────

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

// ── Checkout ─────────────────────────────────────────────────────────────────

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
  if (!priceId) throw new Error("Paddle price ID is not configured for this plan/interval");

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

// ── Subscription management ───────────────────────────────────────────────────

export async function paddleCancelSubscription(subscriptionId: string) {
  return paddleRequest(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ effective_from: "next_billing_period" }),
  });
}

export async function paddleGetSubscription(subscriptionId: string) {
  return paddleRequest(`/subscriptions/${subscriptionId}`);
}

export async function paddlePauseSubscription(subscriptionId: string) {
  return paddleRequest(`/subscriptions/${subscriptionId}/pause`, { method: "POST" });
}

export async function paddleResumeSubscription(subscriptionId: string) {
  return paddleRequest(`/subscriptions/${subscriptionId}/resume`, { method: "POST" });
}

// ── Price fetching ────────────────────────────────────────────────────────────

/**
 * Fetches a single price object from Paddle.
 * Returns null if the price ID is empty or the fetch fails.
 */
export async function paddleGetPrice(priceId: string): Promise<PaddlePrice | null> {
  if (!priceId) return null;
  try {
    const json = await paddleRequest(`/prices/${priceId}`);
    return json.data ?? null;
  } catch {
    return null;
  }
}

export interface PaddlePrice {
  id: string;
  description: string;
  unit_price: { amount: string; currency_code: string };
  billing_cycle: { interval: string; frequency: number } | null;
  trial_period: { interval: string; frequency: number } | null;
}

/**
 * Fetches all 12 configured prices from Paddle in parallel.
 * Skips any price IDs that are empty (not yet configured).
 * Returns a map of priceId → PaddlePrice.
 */
export async function paddleFetchAllPrices(): Promise<Record<string, PaddlePrice>> {
  const ids = Object.values(getAllPriceIds()).filter(Boolean);
  const results = await Promise.allSettled(ids.map((id) => paddleGetPrice(id)));

  const map: Record<string, PaddlePrice> = {};
  ids.forEach((id, i) => {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      map[id] = r.value;
    }
  });
  return map;
}
