/**
 * tiers.ts
 * ─────────
 * Single source of truth for the three paid plan tiers.
 *
 * IMPORTANT — Next.js client-side env var rule:
 * NEXT_PUBLIC_ variables are only inlined into the browser bundle when they
 * are referenced as LITERAL strings (e.g. process.env.NEXT_PUBLIC_FOO).
 * Dynamic bracket access (process.env[key]) is NEVER replaced and always
 * returns undefined in the browser. Every price ID must be read with a
 * literal property access below — no loops, no helpers, no bracket notation.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** The four billing intervals exposed on the pricing page. */
export type PricingInterval = "month" | "quarter" | "semiannual" | "year";

export interface Tier {
  id: "starter" | "growth" | "pro";
  name: "Starter" | "Growth" | "Pro";
  description: string;
  features: string[];
  priceId: {
    month:      string;
    quarter:    string;
    semiannual: string;
    year:       string;
  };
  highlighted?: boolean;
}

// ── Tier definitions ──────────────────────────────────────────────────────────
// Each priceId field uses a LITERAL process.env.NEXT_PUBLIC_* reference so
// Next.js replaces it with the actual value at build/compile time for both
// server and client bundles.

let _tiers: Tier[] | null = null;

export function getTiers(): Tier[] {
  if (_tiers) return _tiers;

  _tiers = [
    {
      id:          "starter",
      name:        "Starter",
      description: "Perfect for side-hustlers and early-stage stores.",
      features: [
        "100 orders / month",
        "1 store",
        "1 ad platform",
        "CSV import",
        "2 team members",
        "Email support",
      ],
      priceId: {
        month:      process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID    ?? "",
        quarter:    process.env.NEXT_PUBLIC_PADDLE_STARTER_QUARTERLY_PRICE_ID  ?? "",
        semiannual: process.env.NEXT_PUBLIC_PADDLE_STARTER_SEMIANNUAL_PRICE_ID ?? "",
        year:       process.env.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID     ?? "",
      },
    },
    {
      id:          "growth",
      name:        "Growth",
      description: "For growing stores ready for real profit insights.",
      features: [
        "1,000 orders / month",
        "2 stores",
        "3 ad platforms",
        "AI insights (weekly digest)",
        "PDF reports",
        "Slack alerts",
        "5 team members",
      ],
      priceId: {
        month:      process.env.NEXT_PUBLIC_PADDLE_GROWTH_MONTHLY_PRICE_ID    ?? "",
        quarter:    process.env.NEXT_PUBLIC_PADDLE_GROWTH_QUARTERLY_PRICE_ID  ?? "",
        semiannual: process.env.NEXT_PUBLIC_PADDLE_GROWTH_SEMIANNUAL_PRICE_ID ?? "",
        year:       process.env.NEXT_PUBLIC_PADDLE_GROWTH_ANNUAL_PRICE_ID     ?? "",
      },
      highlighted: true,
    },
    {
      id:          "pro",
      name:        "Pro",
      description: "For scaling brands with no limits.",
      features: [
        "Unlimited orders",
        "Unlimited stores",
        "All ad platforms",
        "Real-time AI insights",
        "Public API + Zapier",
        "Priority chat support",
        "Unlimited team members",
      ],
      priceId: {
        month:      process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID    ?? "",
        quarter:    process.env.NEXT_PUBLIC_PADDLE_PRO_QUARTERLY_PRICE_ID  ?? "",
        semiannual: process.env.NEXT_PUBLIC_PADDLE_PRO_SEMIANNUAL_PRICE_ID ?? "",
        year:       process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID     ?? "",
      },
    },
  ];

  return _tiers;
}

// ── Startup validation (server-side only) ─────────────────────────────────────
// Call this from instrumentation.ts or your server boot path.
// Client code should never call this — it will always read "" for missing vars.

export function validateTierConfig(): void {
  if (typeof window !== "undefined") return; // client — skip

  const tiers = getTiers();
  const missing: string[] = [];

  for (const tier of tiers) {
    for (const [interval, id] of Object.entries(tier.priceId)) {
      if (!id) missing.push(`${tier.id}_${interval}`);
    }
  }

  if (missing.length > 0) {
    const msg =
      `[tiers] Missing Paddle price IDs: ${missing.join(", ")}. ` +
      `Set NEXT_PUBLIC_PADDLE_<PLAN>_<INTERVAL>_PRICE_ID in your env.`;

    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    } else {
      console.warn(`⚠️  ${msg}`);
    }
  }
}

/**
 * Serialisable snapshot — safe to pass from Server Component to Client Component.
 */
export type SerializedTier = Tier;
