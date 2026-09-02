import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { calcPeriodSummary } from "@/lib/profit-engine";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { teamId?: string; plan?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  // Free plan: return static sample insights instead of calling OpenAI
  if (!user.plan || user.plan === "free" || user.plan === "starter") {
    return NextResponse.json({
      insights: [
        {
          type: "info",
          title: "Upgrade for AI Insights",
          body: "Real-time AI profit analysis is available on Growth and Pro plans. Upgrade to get proactive insights about your margins, ad spend efficiency, and product performance.",
        },
      ],
    });
  }

  try {
    await connectDB();

    const mongoose = (await import("mongoose")).default;
    const teamOid = mongoose.Types.ObjectId.createFromHexString(user.teamId);

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
      grossRevenue: o.grossRevenue, discounts: o.discounts, shippingRevenue: o.shippingRevenue,
      shippingCost: o.shippingCost, totalCogs: o.totalCogs, transactionFees: o.transactionFees,
      taxes: o.taxes, refundAmount: o.refundAmount, chargebackAmount: o.chargebackAmount,
      adSpendAllocated: o.adSpendAllocated,
    }));

    const recent = calcPeriodSummary(toCosts(recentOrders));
    const prior  = calcPeriodSummary(toCosts(priorOrders));

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

Return ONLY this JSON (no markdown, no explanation):
{
  "insights": [
    { "type": "positive|warning|info", "title": "Short title (5 words max)", "body": "2-3 sentence insight with specific numbers from the data above. Be direct and actionable." },
    { ... },
    { ... }
  ]
}
    `.trim();

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

    return NextResponse.json({ insights: parsed.insights ?? [] });
  } catch (err) {
    console.error("AI insights error:", err);
    // Return fallback insights rather than a 500
    return NextResponse.json({
      insights: [
        { type: "info", title: "Insights unavailable", body: "We couldn't generate AI insights right now. Make sure your OpenAI API key is configured and you have order data synced." },
      ],
    });
  }
}
