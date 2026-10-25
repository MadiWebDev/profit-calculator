/**
 * GET /api/analytics/countries — revenue, orders, AOV, margin, net
 * profit, refund rate, RTO rate, shipping and ad cost per country,
 * with city drill-down (?country=Name). Unprofitable countries carry
 * a suggested action. Totals = sum of rows.
 */
import { NextResponse } from "next/server";
import { getReportContext, loadReportOrders, csvResponse } from "@/lib/report-server";
import { summarizeOrders, groupOrders } from "@/lib/parity-reports";

export function suggestedAction(row: { netMargin: number; rtoRate: number; adSpend: number; revenue: number }): string {
  if (row.netMargin < 0) return row.adSpend > 0 ? "Stop ads there until margin recovers" : "Raise shipping rate or change courier";
  if (row.rtoRate > 20) return "Change courier / require prepaid in this country";
  if (row.netMargin < 10) return "Raise shipping rate";
  return "Keep — profitable";
}

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "analytics-countries");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  const countryParam = new URL(req.url).searchParams.get("country") ?? undefined;

  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);
  const rows = groupOrders(orders, (o) => o.shippingCountry?.trim() || "Unknown").map((r) => ({
    ...r,
    country: r.key,
    shippingCostPerOrder: r.orderCount > 0 ? Math.round((r.shippingCost / r.orderCount) * 100) / 100 : 0,
    adCostPerOrder: r.orderCount > 0 ? Math.round((r.adSpend / r.orderCount) * 100) / 100 : 0,
    action: suggestedAction(r),
  }));
  const cities = countryParam
    ? groupOrders(
        orders.filter((o) => (o.shippingCountry?.trim() || "Unknown") === countryParam),
        (o) => o.shippingCity?.trim() || "Unknown city",
      ).map((r) => ({ ...r, city: r.key }))
    : [];

  if (ctx.format === "csv") {
    return csvResponse(
      `countries-${ctx.from.toISOString().slice(0, 10)}.csv`,
      "country,orders,revenue,netProfit,netMargin,aov,refundRate,rtoRate,shippingCost,adSpend,action",
      rows.map((r) => [r.country, r.orderCount, r.revenue, r.netProfit, r.netMargin, r.aov, r.refundRate, r.rtoRate, r.shippingCost, r.adSpend, `"${r.action}"`].join(",")),
    );
  }

  return NextResponse.json({ totals, rows, cities, country: countryParam ?? null, currencies: [...new Set(orders.map((o) => o.currency ?? "USD"))] });
}
