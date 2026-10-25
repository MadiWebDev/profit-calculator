/**
 * GET /api/analytics/product-intel — product intelligence from real
 * orders: fully-loaded profit ranking, break-even price and max safe
 * discount per product (at targetMargin), and 30-day movers.
 *
 * Query: from, to (ISO dates, default last 90 days), storeId
 * (optional), targetMargin (fraction, default 0.25, must be < 0.95).
 * Cancelled orders are excluded by the pure module.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { getProductIntel } from "@/lib/product-intel-server";

const QuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    storeId: z.string().optional(),
    targetMargin: z.coerce.number().min(0).max(0.94).optional().default(0.25),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "analytics-product-intel");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { from: fromRaw, to: toRaw, storeId, targetMargin } = parsed.data;

  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw
    ? new Date(fromRaw)
    : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail("Invalid date range", 400, "INVALID_DATES");
  }

  const data = await getProductIntel(session.teamId, {
    from,
    to,
    storeId,
    targetMargin,
  });
  return NextResponse.json({ ...data, targetMargin });
}
