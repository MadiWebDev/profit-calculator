import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { forecastSeries, type DailyPoint } from "@/lib/analytics";
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";

const QuerySchema = z
  .object({
    days: z.coerce.number().int().min(30).max(365).default(90),
    horizon: z.coerce.number().int().min(7).max(90).default(30),
  })
  .strict();

/**
 * GET /api/analytics/forecast — damped-trend forecast of daily net revenue.
 * Query: days (history, 30–365), horizon (7–90, default 30).
 */
export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "analytics-forecast");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { days, horizon } = parsed.data;

  await connectDB();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const orders = await OrderModel.find({
    teamId: toObjectId(session.teamId),
    orderDate: { $gte: since },
    status: { $ne: "cancelled" },
  })
    .select("currency orderDate grossRevenue refundAmount chargebackAmount")
    .lean();

  // Daily net revenue is summed across orders; convert each order
  // into the report base currency first (multi-currency teams would
  // otherwise forecast on a 1:1 mixed sum).
  const base = await getReportBaseCurrency(session.teamId);
  const rates = await getReportRates(base);

  const byDay = new Map<string, number>();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 3600 * 1000);
    byDay.set(dayKey(d), 0);
  }
  for (const o of orders) {
    const k = dayKey(new Date(o.orderDate));
    const cur = byDay.get(k);
    if (cur !== undefined) {
      const t = o as { currency?: string; grossRevenue?: number; refundAmount?: number; chargebackAmount?: number };
      const conv = (v?: number) => convertAmount(v ?? 0, t.currency, base, rates);
      byDay.set(
        k,
        cur + conv(t.grossRevenue) - conv(t.refundAmount) - conv(t.chargebackAmount)
      );
    }
  }

  const history: DailyPoint[] = [...byDay.entries()].map(([date, value]) => ({
    date,
    value: Math.round(value * 100) / 100,
  }));

  const forecast = forecastSeries(history, horizon);

  return NextResponse.json({
    days,
    horizon,
    history,
    forecast,
    generatedAt: new Date().toISOString(),
  });
}
