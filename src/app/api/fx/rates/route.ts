import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { withRateLimit } from "@/lib/rate-limit";
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
 * conversion. Rates are indicative spot rates — not for accounting.
 *
 * Two paths, same payload shape:
 *  - Signed in: the team's saved manual overrides are applied on top of
 *    the fetched rates (overrides win from their effective date), so
 *    display conversion and report conversion agree. The browser cache
 *    is deliberately short and private (60s): the old 1-hour public
 *    cache defeated real-time display and must not be restored for an
 *    authenticated response.
 *  - Signed out: the shared fetched rates with NO overrides (there is
 *    no team to read overrides from), behind the standard per-IP rate
 *    limit and a public 60s browser cache. Rates are public market
 *    data — nothing user-specific is in the response — and the shared
 *    DB snapshot + single-flight refresh mean anonymous traffic cannot
 *    burn currencyapi.net quota: the provider is fetched at most once
 *    per refresh window no matter how many clients ask.
 *
 * Only a bare 401 (no session at all) falls through to the public
 * path. Any other refusal from requireAuth (429 rate limit, 402
 * archived trial, 403 2FA / incomplete session) stands — the public
 * path is not a way around a limit.
 */
export async function GET(req: NextRequest) {
  const authed = await requireAuth(req, { rateLimitKey: "fx-rates" });
  if (authed instanceof NextResponse) {
    if (authed.status !== 401) return authed;
    const q = parseQuery(req, QuerySchema);
    if ("response" in q) return q.response;
    const rl = await withRateLimit(req, "standard", "fx-rates-public");
    if (rl) return rl;
    try {
      const rates = await getFxRates(q.data.base);
      return NextResponse.json(rates, {
        headers: { "Cache-Control": "public, max-age=60" },
      });
    } catch (err) {
      await logFxFailure(err);
      return fail("FX rates unavailable", 503, "FX_UNAVAILABLE");
    }
  }

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
