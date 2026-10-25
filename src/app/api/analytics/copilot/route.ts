/**
 * POST /api/analytics/copilot — Copilot over aggregated numbers only.
 * No PII is ever returned: answers are computed from period totals,
 * per-country and per-campaign aggregates, and every answer cites the
 * numbers behind it. The engine is deterministic rules over those
 * aggregates — no external LLM call, so no customer data can leak to
 * a third party.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody } from "@/lib/validation";
import { loadReportOrders, type ReportContext } from "@/lib/report-server";
import { summarizeOrders, groupOrders } from "@/lib/parity-reports";

const BodySchema = z.object({
  question: z.string().trim().min(3).max(500),
  from: z.string().optional(),
  to: z.string().optional(),
  storeId: z.string().optional(),
}).strict();

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "copilot" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;
  const parsed = await parseBody(req, BodySchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;

  const to = b.to ? new Date(b.to) : new Date();
  const from = b.from ? new Date(b.from) : new Date(to.getTime() - 30 * 864e5);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  to.setHours(23, 59, 59, 999);
  if (b.storeId && !/^[a-f0-9]{24}$/i.test(b.storeId)) {
    return NextResponse.json({ error: "Invalid storeId" }, { status: 400 });
  }
  const ctx: ReportContext = {
    session: session as ReportContext["session"],
    from, to, storeId: b.storeId, currency: undefined, format: "json", granularity: "daily",
  };

  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);
  const countries = groupOrders(orders, (o) => o.shippingCountry?.trim() || "Unknown");
  const campaigns = groupOrders(orders, (o) => o.utmCampaign ?? "Unattributed");
  const q = b.question.toLowerCase();

  const bestCountry = countries[0] ?? null;
  const worstCountry = [...countries].sort((a, b) => a.netProfit - b.netProfit)[0] ?? null;
  const lossCampaigns = campaigns.filter((c) => c.adSpend > 0 && c.netProfit < 0);

  let answer: string;
  const numbers: Record<string, number | string> = {
    revenue: totals.revenue, netProfit: totals.netProfit, netMargin: totals.netMargin,
    orders: totals.orderCount, aov: totals.aov, adSpend: totals.adSpend,
  };
  if (q.includes("country") || q.includes("where")) {
    answer = bestCountry
      ? `Your most profitable country is ${bestCountry.key}: ${bestCountry.netProfit.toFixed(2)} net profit on ${bestCountry.revenue.toFixed(2)} revenue across ${bestCountry.orderCount} orders (${bestCountry.netMargin}% margin).`
      : "No country data in this period — orders have no shipping country recorded.";
    if (worstCountry && worstCountry.netProfit < 0) {
      answer += ` The least profitable is ${worstCountry.key} at ${worstCountry.netProfit.toFixed(2)} net profit — see Country Analysis for the suggested action.`;
    }
  } else if (q.includes("campaign") || q.includes("ad")) {
    answer = lossCampaigns.length > 0
      ? `${lossCampaigns.length} campaign(s) lost money in this period. The worst is ${lossCampaigns[0].key} (${lossCampaigns[0].netProfit.toFixed(2)} net profit on ${lossCampaigns[0].adSpend.toFixed(2)} ad spend). Pause or fix it before scaling.`
      : `No loss-making campaigns in this period. Total ad spend was ${totals.adSpend.toFixed(2)} against ${totals.revenue.toFixed(2)} revenue.`;
  } else if (q.includes("leak") || q.includes("losing") || q.includes("fix")) {
    answer = lossCampaigns.length > 0
      ? `Start with campaigns: ${lossCampaigns.map((c) => `${c.key} (${c.netProfit.toFixed(2)})`).join(", ")}. Then check the Leak Detector page for negative-margin products and missing COGS.`
      : "No loss-making campaigns found in this period. Check the Leak Detector page for missing COGS and stuck shipments.";
  } else {
    answer = `In this period you made ${totals.netProfit.toFixed(2)} net profit (${totals.netMargin}% margin) on ${totals.revenue.toFixed(2)} revenue across ${totals.orderCount} orders (AOV ${totals.aov.toFixed(2)}). Ad spend was ${totals.adSpend.toFixed(2)}.`;
  }

  return NextResponse.json({
    answer,
    numbers,
    period: { from: ctx.from.toISOString().slice(0, 10), to: ctx.to.toISOString().slice(0, 10) },
    note: "Computed from aggregated order totals only — no customer names, emails, or order-level PII were used.",
  });
}
