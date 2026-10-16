import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseQuery, fail } from "@/lib/validation";
import { getFxRates, logFxFailure } from "@/lib/fx";

const QuerySchema = z
  .object({
    base: z
      .string()
      .trim()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .transform((s) => s.toUpperCase())
      .default("USD"),
  })
  .strict();

/**
 * GET /api/fx/rates?base=USD
 *
 * Returns cached FX rates (units per 1 USD-base) for display-currency
 * conversion. Authenticated; standard rate limit. Rates are indicative
 * spot rates — not for accounting.
 */
export async function GET(req: NextRequest) {
  const authed = await requireAuth(req, { rateLimitKey: "fx-rates" });
  if (authed instanceof NextResponse) return authed;

  const q = parseQuery(req, QuerySchema);
  if ("response" in q) return q.response;

  try {
    const rates = await getFxRates(q.data.base);
    return NextResponse.json(rates, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    await logFxFailure(err);
    return fail("FX rates unavailable", 503, "FX_UNAVAILABLE");
  }
}
