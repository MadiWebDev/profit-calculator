import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { checkSubscription } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import InsightModel from "@/models/Insight";
import { normalizeReportOrders } from "@/lib/reporting";
import { detectAnomalies, forecastSeries, type DailyPoint } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import OpenAI from "openai";
import { fail } from "@/lib/validation";

/** Lazily constructed — module import must never throw when the env var is missing (build time). */
function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "strict", "ai-insights");
  if (rl) return rl;

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { teamId?: string; plan?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const block = await checkSubscription(user.teamId);
  if (block) return block;

  // Plan gate: AI insights (per-plan monthly cap enforced by entitlements)
  const { checkEntitlement } = await import("@/lib/entitlements");
  const ent = await checkEntitlement(user.teamId, "ai.insights");
  if ("response" in ent) {
    // Return the upgrade nudge instead of a hard 402 so the UI degrades gracefully
    return NextResponse.json({
      insights: [
        {
          type: "info",
          title: "Upgrade for AI Insights",
          body: "Real-time AI profit analysis is available on Growth and Pro plans. Upgrade to get proactive insights about your margins, ad spend efficiency, and product performance.",
        },
      ],
      planLimited: true,
    });
  }

  try {
    await connectDB();

    const mongoose = (await import("mongoose")).default;
    const teamOid = mongoose.Types.ObjectId.createFromHexString(user.teamId);
    const today = new Date().toISOString().slice(0, 10);

    // AI v2: serve today's cached insights when available (unique index on
    // teamId+period+kind makes this a cheap lookup and prevents duplicate spend)
    const cached = await InsightModel.findOne({
      teamId: teamOid,
      period: today,
      kind: "daily",
    }).lean();
    if (cached && cached.items.length > 0) {
      return NextResponse.json({ insights: cached.items, cached: true });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Fetch last 30 days + prior 30 days for comparison
    const [recentOrders, priorOrders, recentAds] = await Promise.all([
      OrderModel.find({ teamId: teamOid, orderDate: { $gte: thirtyDaysAgo }, status: { $ne: "cancelled" } }).lean(),
      OrderModel.find({ teamId: teamOid, orderDate: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }, status: { $ne: "cancelled" } }).lean(),
      AdSpendDailyModel.aggregate([
        { $match: { teamId: teamOid, date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: "$platform", spend: { $sum: "$spend" }, revenue: { $sum: "$revenueAttributed" }, conversions: { $sum: "$conversions" } } },
      ]),
    ]);

    const toCosts = (orders: typeof recentOrders) => orders.map((o) => ({
      currency: o.currency,
      grossRevenue: o.grossRevenue, discounts: o.discounts, shippingRevenue: o.shippingRevenue,
      shippingCost: o.shippingCost, totalCogs: o.totalCogs, transactionFees: o.transactionFees,
      taxes: o.taxes, refundAmount: o.refundAmount, chargebackAmount: o.chargebackAmount,
      adSpendAllocated: o.adSpendAllocated,
    }));

    // Normalize to the team's base currency before aggregating — never sum
    // mixed currencies 1:1.
    const [recentReport, priorReport] = await Promise.all([
      normalizeReportOrders(toCosts(recentOrders), user.teamId),
      normalizeReportOrders(toCosts(priorOrders), user.teamId),
    ]);
    const recent = recentReport.summary;
    const prior  = priorReport.summary;

    // AI v2 context: statistical anomalies + 30-day revenue forecast.
    // dailyNet uses the normalized per-order costs so the series is in one
    // currency too.
    const dailyNet = new Map<string, number>();
    recentOrders.forEach((o, i) => {
      const c = recentReport.normalized[i];
      if (!c) return;
      const k = new Date(o.orderDate).toISOString().slice(0, 10);
      dailyNet.set(k, (dailyNet.get(k) ?? 0) + c.grossRevenue - c.refundAmount - c.chargebackAmount);
    });
    const netSeries: DailyPoint[] = [...dailyNet.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
    const anomalies = detectAnomalies(netSeries).slice(-5);
    const forecast = forecastSeries(netSeries, 30);
    const forecastTotal = forecast.reduce((a, p) => a + p.forecast, 0);

    const anomalyLines = anomalies.length > 0
      ? anomalies.map((a) => `- ${a.date}: ${a.direction} to $${a.value.toFixed(2)} (expected $${a.expected.toFixed(2)}, z=${a.zScore}, ${a.severity})`).join("\n")
      : "- No anomalies in the last 30 days";

    const prompt = `
You are an ecommerce profit analyst. Analyse this merchant's last 30 days vs prior 30 days and return exactly 3 JSON insights.

LAST 30 DAYS:
- Revenue: $${recent.totalRevenue.toFixed(2)}
- Net Profit: $${recent.netProfit.toFixed(2)}
- Net Margin: ${recent.netMargin.toFixed(1)}%
- Gross Margin: ${recent.grossMargin.toFixed(1)}%
- Total COGS: $${recent.totalCogs.toFixed(2)}
- Ad Spend: $${recent.totalAdSpend.toFixed(2)}
- Refunds: $${recent.totalRefunds.toFixed(2)}
- Orders: ${recent.orderCount}
- Avg Order Value: $${recent.avgOrderValue.toFixed(2)}

PRIOR 30 DAYS:
- Revenue: $${prior.totalRevenue.toFixed(2)}
- Net Profit: $${prior.netProfit.toFixed(2)}
- Net Margin: ${prior.netMargin.toFixed(1)}%
- Ad Spend: $${prior.totalAdSpend.toFixed(2)}

AD PLATFORM BREAKDOWN (last 30d):
${recentAds.map((a: { _id: string; spend: number; revenue: number; conversions: number }) =>
  `- ${a._id}: spend $${a.spend.toFixed(2)}, revenue $${a.revenue.toFixed(2)}, ROAS ${a.spend > 0 ? (a.revenue / a.spend).toFixed(2) : 0}x, ${a.conversions} conversions`
).join("\n") || "- No ad data available"}

DETECTED ANOMALIES (z-score, trailing 28d baseline):
${anomalyLines}

REVENUE FORECAST (next 30d, damped trend): $${forecastTotal.toFixed(2)} total

Return ONLY this JSON (no markdown, no explanation):
{
  "insights": [
    { "type": "positive|warning|info", "title": "Short title (5 words max)", "body": "2-3 sentence insight with specific numbers from the data above. Be direct and actionable. Reference anomalies or the forecast when relevant." },
    { ... },
    { ... }
  ]
}
    `.trim();

    const openai = getOpenAI();
    if (!openai) {
      return fail("AI insights are not configured", 503, "AI_NOT_CONFIGURED");
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content ?? "{}";

    // Robustly parse — strip markdown fences if present
    const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);
    const items = Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5) : [];

    // Cache today's insights (upsert — the unique index prevents duplicates
    // when two requests race)
    if (items.length > 0) {
      await InsightModel.findOneAndUpdate(
        { teamId: teamOid, period: today, kind: "daily" },
        {
          $set: {
            items: items.map((i: { type: string; title: string; body: string }) => ({
              type: ["positive", "warning", "info"].includes(i.type) ? i.type : "info",
              title: String(i.title ?? "").slice(0, 120),
              body: String(i.body ?? "").slice(0, 2000),
            })),
            modelName: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
            tokensUsed: completion.usage?.total_tokens,
            inputs: {
              revenue30d: Math.round(recent.totalRevenue * 100) / 100,
              netProfit30d: Math.round(recent.netProfit * 100) / 100,
              anomalies: anomalies.length,
              forecast30d: Math.round(forecastTotal * 100) / 100,
            },
          },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({ insights: items });
  } catch (err) {
    logger.error("ai-insights: generation failed", err instanceof Error ? err : new Error("unknown"));
    // Return fallback insights rather than a 500
    return NextResponse.json({
      insights: [
        { type: "info", title: "Insights unavailable", body: "We couldn't generate AI insights right now. Make sure your OpenAI API key is configured and you have order data synced." },
      ],
    });
  }
}
