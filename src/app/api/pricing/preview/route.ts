/**
 * GET /api/pricing/preview?country=XX
 *
 * Server-side Paddle price preview for all 12 price IDs (3 tiers × 4
 * intervals), cached per country (fresh 1h, stale-while-revalidate 24h)
 * in src/lib/paddle-pricing.ts. This is the fast path behind /pricing's
 * first paint: the browser no longer has to download Paddle.js and run
 * PricePreview before prices can render.
 *
 * Public — no auth, no user data. `Cache-Control: public, s-maxage=3600,
 * stale-while-revalidate=86400` lets browsers and the CDN cache it too.
 *
 * Returns 503 PRICING_UNAVAILABLE when Paddle is unreachable and nothing
 * is cached (e.g. PADDLE_API_KEY unset) — callers fall back to the
 * client-side PricePreview flow.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseQuery, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { getCachedPricePreview } from "@/lib/paddle-pricing";

const QuerySchema = z
  .object({
    country: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Za-z]{2}$/)
      .transform((s) => s.toUpperCase())
      .optional(),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "lenient", "pricing-preview");
  if (rl) return rl;

  const q = parseQuery(req, QuerySchema);
  if ("response" in q) return q.response;

  const prices = await getCachedPricePreview(q.data.country);
  if (!prices) {
    return fail("Pricing preview unavailable", 503, "PRICING_UNAVAILABLE");
  }

  return NextResponse.json(
    { prices, country: q.data.country ?? null },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
