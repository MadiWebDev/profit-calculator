import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseQuery, fail } from "@/lib/validation";
import { getFxRates, logFxFailure } from "@/lib/fx";
import { getTeamFxOverrides } from "@/lib/report-currency";
import { connectDB } from "@/lib/db";

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
 * Returns cached FX rates (units per 1 base currency) for display-currency
 * conversion. Authenticated; standard rate limit. Rates are indicative
 * spot rates — not for accounting. The team's saved manual overrides
 * are applied on top of the fetched rates (overrides win from their
 * effective date), so display conversion and report conversion agree.
 * The browser cache is deliberately short (60s): the old 1-hour
 * public cache defeated real-time display and must not be restored
 * for an authenticated response.
 */
export async function GET(req: NextRequest) {
  const authed = await requireAuth(req, { rateLimitKey: "fx-rates" });
  if (authed instanceof NextResponse) return authed;

  const q = parseQuery(req, QuerySchema);
  if ("response" in q) return q.response;

  try {
    // Overrides are best-effort here: a failure to read them must
    // never 503 the rates endpoint — fetched rates still serve.
    let overrides: Awaited<ReturnType<typeof getTeamFxOverrides>> = [];
    try {
      await connectDB();
      overrides = await getTeamFxOverrides(authed.session.teamId);
    } catch {
      overrides = [];
    }
    const rates = await getFxRates(q.data.base, overrides);
    return NextResponse.json(rates, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    await logFxFailure(err);
    return fail("FX rates unavailable", 503, "FX_UNAVAILABLE");
  }
}
