/**
 * GET /api/analytics/rfm — RFM customer segmentation from real
 * orders: per-customer recency/frequency/monetary scores (relative
 * quintiles within this store's customers) and segment summaries.
 *
 * Query: from, to (ISO dates, default last 365 days), storeId
 * (optional). Cancelled orders and orders without an email are
 * excluded by the pure module.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { getRfm } from "@/lib/rfm-server";

const QuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    storeId: z.string().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "analytics-rfm");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { from: fromRaw, to: toRaw, storeId } = parsed.data;

  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw
    ? new Date(fromRaw)
    : new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail("Invalid date range", 400, "INVALID_DATES");
  }

  const data = await getRfm(session.teamId, { from, to, storeId });
  return NextResponse.json({
    customers: data.customers.map((c) => ({
      ...c,
      firstOrderDate: c.firstOrderDate.toISOString(),
      lastOrderDate: c.lastOrderDate.toISOString(),
    })),
    segments: data.segments,
  });
}
