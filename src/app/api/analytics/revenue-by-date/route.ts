/**
 * GET /api/analytics/revenue-by-date — daily/weekly/monthly revenue,
 * orders, AOV, net profit, refunds, with day-of-week and hour-of-day
 * patterns, previous-period comparison, and best/worst day callouts.
 * Totals = sum of rows, via src/lib/parity-reports.ts.
 */
import { NextResponse } from "next/server";
import { getReportContext, loadReportOrders, csvResponse } from "@/lib/report-server";
import { summarizeOrders, bucketOrders, timePatterns } from "@/lib/parity-reports";

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "analytics-revenue-by-date");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;

  const orders = await loadReportOrders(ctx);
  const rows = bucketOrders(orders, ctx.granularity);
  const totals = summarizeOrders(orders);
  const { dayOfWeek, hourOfDay } = timePatterns(orders);

  // Previous period, same length, for comparison.
  const lengthMs = ctx.to.getTime() - ctx.from.getTime();
  const prevTo = new Date(ctx.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - lengthMs);
  const prevOrders = await loadReportOrders({ ...ctx, from: prevFrom, to: prevTo });
  const previous = summarizeOrders(prevOrders);

  const sorted = [...rows].sort((a, b) => b.netProfit - a.netProfit);
  const currencies = [...new Set(orders.map((o) => o.currency ?? "USD"))];

  if (ctx.format === "csv") {
    return csvResponse(
      `revenue-by-date-${ctx.from.toISOString().slice(0, 10)}-${ctx.to.toISOString().slice(0, 10)}.csv`,
      "date,orders,revenue,refunds,cogs,netProfit,netMargin,aov",
      rows.map((r) => [r.key, r.orderCount, r.revenue, r.refunds, r.cogs, r.netProfit, r.netMargin, r.aov].join(",")),
    );
  }

  return NextResponse.json({
    totals, rows, previous, dayOfWeek, hourOfDay,
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
    currencies,
    granularity: ctx.granularity,
  });
}
