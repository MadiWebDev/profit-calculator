import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { buildCohorts } from "@/lib/analytics";
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";

const QuerySchema = z
  .object({
    months: z.coerce.number().int().min(3).max(36).default(12),
  })
  .strict();

/**
 * GET /api/analytics/cohorts — monthly customer cohorts keyed by first order.
 * Query: months (3–36, default 12).
 */
export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "analytics-cohorts");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { months } = parsed.data;

  await connectDB();
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const orders = await OrderModel.find({
    teamId: toObjectId(session.teamId),
    orderDate: { $gte: since },
    status: { $ne: "cancelled" },
    $or: [{ customerId: { $ne: null } }, { customerEmail: { $ne: null } }],
  })
    .select("currency orderDate customerId customerEmail grossRevenue refundAmount chargebackAmount")
    .lean();

  // Cohort revenue sums orders per customer; convert each order into
  // the report base currency first.
  const base = await getReportBaseCurrency(session.teamId);
  const rates = await getReportRates(base);

  const cohorts = buildCohorts(
    orders.map((o) => {
      const t = o as {
        orderDate: Date; customerId?: string; customerEmail?: string; currency?: string;
        grossRevenue?: number; refundAmount?: number; chargebackAmount?: number;
      };
      const conv = (v?: number) => convertAmount(v ?? 0, t.currency, base, rates);
      return {
        orderDate: new Date(t.orderDate).toISOString(),
        customerId: t.customerId ?? t.customerEmail ?? "unknown",
        netRevenue: conv(t.grossRevenue) - conv(t.refundAmount) - conv(t.chargebackAmount),
      };
    })
  );

  return NextResponse.json({ months, cohorts, generatedAt: new Date().toISOString() });
}
