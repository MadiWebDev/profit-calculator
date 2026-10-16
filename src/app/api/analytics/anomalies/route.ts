import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseQuery, toObjectId } from "@/lib/validation";
import { checkSubscription } from "@/lib/api-helpers";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { detectAnomalies, type DailyPoint } from "@/lib/analytics";
import { calcOrderProfit } from "@/lib/profit-engine";

const QuerySchema = z
  .object({
    days: z.coerce.number().int().min(30).max(365).default(90),
    metric: z.enum(["netProfit", "netRevenue", "adSpend"]).default("netProfit"),
  })
  .strict();

/**
 * GET /api/analytics/anomalies — z-score anomaly detection over daily P&L.
 * Query: days (30–365, default 90), metric (netProfit|netRevenue|adSpend).
 */
export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "analytics-anomalies");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { days, metric } = parsed.data;

  await connectDB();
  const teamOid = toObjectId(session.teamId);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const [orders, adSpend] = await Promise.all([
    OrderModel.find({
      teamId: teamOid,
      orderDate: { $gte: since },
      status: { $ne: "cancelled" },
    })
      .select("orderDate grossRevenue refundAmount chargebackAmount totalCogs shippingCost transactionFees otherCosts")
      .lean(),
    AdSpendDailyModel.find({ teamId: teamOid, date: { $gte: since } })
      .select("date spend")
      .lean(),
  ]);

  // Aggregate to daily buckets
  const byDay = new Map<string, { orders: typeof orders; spend: number }>();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 3600 * 1000);
    byDay.set(dayKey(d), { orders: [], spend: 0 });
  }
  for (const o of orders) {
    const k = dayKey(new Date(o.orderDate));
    const bucket = byDay.get(k);
    if (bucket) bucket.orders.push(o);
  }
  for (const a of adSpend) {
    const k = dayKey(new Date(a.date));
    const bucket = byDay.get(k);
    if (bucket) bucket.spend += a.spend ?? 0;
  }

  const series: DailyPoint[] = [...byDay.entries()].map(([date, b]) => {
    let value: number;
    if (metric === "adSpend") {
      value = b.spend;
    } else {
      const agg = { netRevenue: 0, cogs: 0, shippingCost: 0, transactionFees: 0, otherCosts: 0 };
      for (const o of b.orders) {
        const oTyped = o as {
          grossRevenue?: number; refundAmount?: number; chargebackAmount?: number;
          totalCogs?: number; shippingCost?: number; transactionFees?: number; otherCosts?: number;
        };
        agg.netRevenue += (oTyped.grossRevenue ?? 0) - (oTyped.refundAmount ?? 0) - (oTyped.chargebackAmount ?? 0);
        agg.cogs += oTyped.totalCogs ?? 0;
        agg.shippingCost += oTyped.shippingCost ?? 0;
        agg.transactionFees += oTyped.transactionFees ?? 0;
        agg.otherCosts += oTyped.otherCosts ?? 0;
      }
      value = metric === "netRevenue"
        ? agg.netRevenue
        : calcOrderProfit({
            grossRevenue: agg.netRevenue,
            discounts: 0,
            shippingRevenue: 0,
            shippingCost: agg.shippingCost,
            totalCogs: agg.cogs,
            transactionFees: agg.transactionFees,
            taxes: 0,
            refundAmount: 0,
            chargebackAmount: 0,
            adSpendAllocated: b.spend,
            otherCosts: agg.otherCosts,
          }).netProfit;
    }
    return { date, value: Math.round(value * 100) / 100 };
  });

  const anomalies = detectAnomalies(series);

  return NextResponse.json({
    metric,
    days,
    series,
    anomalies,
    scannedAt: new Date().toISOString(),
  });
}
