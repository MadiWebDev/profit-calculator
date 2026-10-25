/**
 * GET /api/analytics/profit — Phase 3 true-profit dashboard API.
 *
 * Query: from, to (ISO dates, default last 30 days), storeId (optional),
 * format=json (default) | csv.
 *
 * Returns, all team-scoped: dashboard metrics (revenue, net profit,
 * margin, AOV, ROAS, MER, break-even ROAS, CAC, LTV, return/RTO rates,
 * COD cash collected vs pending), the previous-period comparison for
 * the same length, a daily series, and a per-product winners/losers
 * table (gross profit = revenue − COGS, before allocated costs).
 * Cancelled orders are excluded from metrics (they are not sales).
 * CSV format exports the daily series.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import {
  calcDashboardMetrics,
  comparePeriods,
  type DashboardOrderInput,
} from "@/lib/profit-extended";

const QuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    storeId: z.string().optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict();

function toInput(o: Record<string, unknown>): DashboardOrderInput {
  const n = (k: string): number => {
    const v = o[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  return {
    grossRevenue: n("grossRevenue"),
    discounts: n("discounts"),
    shippingRevenue: n("shippingRevenue"),
    shippingCost: n("shippingCost"),
    totalCogs: n("totalCogs"),
    transactionFees: n("transactionFees"),
    taxes: n("taxes"),
    refundAmount: n("refundAmount"),
    chargebackAmount: n("chargebackAmount"),
    adSpendAllocated: n("adSpendAllocated"),
    otherCosts: n("otherCosts"),
    packagingCost: n("packagingCost"),
    codFee: n("codFee"),
    subscriptionShare: n("subscriptionShare"),
    rtoLoss: n("rtoLoss"),
    expenseAllocation: n("expenseAllocation"),
    status: typeof o.status === "string" ? o.status : undefined,
    isRto: n("rtoLoss") > 0,
    isReturn: n("refundAmount") > 0,
    customerKey: (o.customerId as string | undefined) ?? (o.customerEmail as string | undefined),
    isFirstOrder: o.isFirstOrder === true,
    codCollected: n("codCollected"),
    codPending: n("codPending"),
  };
}

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "analytics-profit");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { from, to, storeId, format } = parsed.data;

  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 864e5);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return NextResponse.json({ error: "Invalid date range", code: "BAD_REQUEST" }, { status: 400 });
  }
  const lengthMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - lengthMs);

  await connectDB();
  const baseFilter: Record<string, unknown> = { teamId: toObjectId(session.teamId) };
  if (storeId) {
    if (!/^[a-f0-9]{24}$/i.test(storeId)) {
      return NextResponse.json({ error: "Invalid storeId", code: "BAD_REQUEST" }, { status: 400 });
    }
    baseFilter.storeId = toObjectId(storeId);
  }

  const [orders, prevOrders] = await Promise.all([
    OrderModel.find({ ...baseFilter, orderDate: { $gte: fromDate, $lte: toDate } }).lean(),
    OrderModel.find({ ...baseFilter, orderDate: { $gte: prevFrom, $lte: prevTo } }).lean(),
  ]);

  const metrics = calcDashboardMetrics(orders.map((o) => toInput(o as unknown as Record<string, unknown>)));
  const previous = calcDashboardMetrics(prevOrders.map((o) => toInput(o as unknown as Record<string, unknown>)));
  const deltas = comparePeriods(metrics, previous);

  // Daily series
  const byDay = new Map<string, DashboardOrderInput[]>();
  for (const o of orders) {
    const d = new Date((o as { orderDate: Date }).orderDate).toISOString().slice(0, 10);
    const list = byDay.get(d) ?? [];
    list.push(toInput(o as unknown as Record<string, unknown>));
    byDay.set(d, list);
  }
  const daily = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => ({ date, ...calcDashboardMetrics(list) }));

  // Per-product winners/losers (gross profit before allocated costs)
  const productMap = new Map<string, { productId: string; name: string; revenue: number; cogs: number; units: number; orders: number }>();
  for (const o of orders) {
    if ((o as { status?: string }).status === "cancelled") continue;
    for (const li of (o as { lineItems?: { productId?: string; name?: string; price?: number; cogs?: number; quantity?: number }[] }).lineItems ?? []) {
      const key = li.productId ?? li.name ?? "unknown";
      const cur = productMap.get(key) ?? { productId: key, name: li.name ?? key, revenue: 0, cogs: 0, units: 0, orders: 0 };
      cur.revenue += (li.price ?? 0) * (li.quantity ?? 0);
      cur.cogs += (li.cogs ?? 0) * (li.quantity ?? 0);
      cur.units += li.quantity ?? 0;
      cur.orders += 1;
      productMap.set(key, cur);
    }
  }
  const products = [...productMap.values()]
    .map((p) => ({
      ...p,
      revenue: Math.round(p.revenue * 100) / 100,
      grossProfit: Math.round((p.revenue - p.cogs) * 100) / 100,
      margin: p.revenue > 0 ? Math.round(((p.revenue - p.cogs) / p.revenue) * 100 * 100) / 100 : 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);

  if (format === "csv") {
    const header = "date,orders,revenue,netProfit,netMargin,adSpend,roas,rtoRate,returnRate,cashCollected,cashPending";
    const rows = daily.map((d) =>
      [d.date, d.orderCount, d.revenue, d.netProfit, d.netMargin, d.adSpend, d.roas, d.rtoRate, d.returnRate, d.cashCollected, d.cashPending].join(",")
    );
    return new NextResponse([header, ...rows].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="profit-daily-${fromDate.toISOString().slice(0, 10)}-${toDate.toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    metrics,
    previous,
    deltas,
    daily,
    products,
    winners: products.slice(0, 10),
    losers: [...products].reverse().slice(0, 10),
    generatedAt: new Date().toISOString(),
  });
}
