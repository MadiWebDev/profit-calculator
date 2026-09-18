import { NextResponse } from "next/server";
import { paddleFetchAllPrices, getAllPriceIds } from "@/lib/billing";
import type { PlanKey, BillingInterval } from "@/lib/billing";

/**
 * GET /api/billing/prices
 *
 * Returns the live price amounts for every configured Paddle price ID,
 * keyed by "plan_interval" (e.g. "starter_monthly").
 *
 * Response shape:
 * {
 *   "starter_monthly":    { priceId, amountCents, currency, billingCycle },
 *   "starter_quarterly":  { priceId, amountCents, currency, billingCycle },
 *   …
 * }
 *
 * If a price ID is not yet configured (empty env var) or Paddle returns an
 * error for it, the key is omitted from the response — the UI falls back
 * to the static base prices defined in plans.ts.
 *
 * This route is publicly readable (no auth) — prices are not sensitive.
 * Response is cached for 10 minutes via Cache-Control.
 */

interface PriceEntry {
  priceId: string;
  amountCents: number;
  currency: string;
  billingCycle: { interval: string; frequency: number } | null;
}

export async function GET() {
  try {
    const allIds   = getAllPriceIds();   // { "starter_monthly": "pri_xxx", … }
    const priceMap = await paddleFetchAllPrices();  // { "pri_xxx": PaddlePrice, … }

    const result: Record<string, PriceEntry> = {};

    for (const [key, priceId] of Object.entries(allIds)) {
      if (!priceId) continue;
      const paddlePrice = priceMap[priceId];
      if (!paddlePrice) continue;

      // Paddle returns unit_price.amount as a string in the currency's minor unit
      // e.g. "999" for $9.99 USD, "900" for €9.00
      const amountCents = parseInt(paddlePrice.unit_price.amount, 10);
      if (isNaN(amountCents)) continue;

      result[key] = {
        priceId,
        amountCents,
        currency:     paddlePrice.unit_price.currency_code,
        billingCycle: paddlePrice.billing_cycle ?? null,
      };
    }

    return NextResponse.json(result, {
      headers: {
        // Cache for 10 minutes — prices rarely change mid-session
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[prices] Failed to fetch Paddle prices:", err);
    // Return empty object — clients will fall back to static prices
    return NextResponse.json(
      {},
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

// Export types for the client hook
export type { PriceEntry };
export type PricesResponse = Record<string, PriceEntry>;
export type { PlanKey, BillingInterval };
