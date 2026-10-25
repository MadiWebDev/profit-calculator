/**
 * GET /api/analytics/mission-control — command center: today's live
 * profit vs target, the 5 most important actions now (each with a
 * one-click deep link), integration health, anomaly feed, and a data
 * health score with fixes. No PII in the response.
 */
import { NextResponse } from "next/server";
import { toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import AdAccountModel from "@/models/AdAccount";
import ShipmentModel from "@/models/Shipment";
import CogsRuleModel from "@/models/CogsRule";
import ProductModel from "@/models/Product";
import ProfitGoalModel from "@/models/ProfitGoal";
import { summarizeOrders, detectLeaks } from "@/lib/parity-reports";
import { getReportContext, loadReportOrders } from "@/lib/report-server";

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "analytics-mission-control");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;

  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOrders = await loadReportOrders({ ...ctx, from: today, to: new Date() });
  const todayTotals = summarizeOrders(todayOrders);

  await connectDB();
  const teamOid = toObjectId(ctx.session.teamId);
  const [stores, adAccounts, shipments, products, cogsRules, goals, highRisk] = await Promise.all([
    StoreModel.find({ teamId: teamOid, isActive: true }).lean(),
    AdAccountModel.find({ teamId: teamOid, isActive: true }).lean(),
    ShipmentModel.find({ teamId: teamOid }).lean(),
    ProductModel.find({ teamId: teamOid }).lean(),
    CogsRuleModel.find({ teamId: teamOid }).lean(),
    ProfitGoalModel.find({ teamId: teamOid }).lean(),
    OrderModel.countDocuments({ teamId: teamOid, riskBand: { $in: ["high", "critical"] }, riskStatus: "unreviewed" }),
  ]);

  const stuck = shipments.filter((s) => {
    const updated = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    return s.status !== "delivered" && s.status !== "returned_rto" && s.status !== "cancelled" && Date.now() - updated > 5 * 864e5;
  }).length;
  const cogsProductIds = new Set(cogsRules.map((r) => r.productId));
  const missingCogs = products.filter((p) => !p.defaultCogs && (!p.externalId || !cogsProductIds.has(p.externalId))).length;

  const leaks = detectLeaks({ orders, missingCogsProducts: missingCogs, stuckShipments: stuck, highRiskUnreviewed: highRisk });
  const actions = leaks.slice(0, 5).map((l) => ({
    title: l.title, detail: l.detail, amount: l.amount, actionLabel: l.actionLabel, actionHref: l.actionHref,
  }));

  const goal = goals[0];
  const target = goal ? Number((goal as { targetProfit?: number }).targetProfit ?? 0) : 0;
  const integrations = [
    ...stores.map((s) => ({ name: `Store: ${s.name}`, status: s.syncStatus, lastSuccess: s.lastSyncAt?.toISOString() ?? null, error: s.syncError ?? null })),
    ...adAccounts.map((a) => ({ name: `Ads: ${a.platform}`, status: a.syncStatus, lastSuccess: a.lastSyncAt?.toISOString() ?? null, error: null })),
  ];

  // Data health: % of orders with COGS, country, and source recorded.
  const withCogs = orders.filter((o) => (o.totalCogs ?? 0) > 0).length;
  const withCountry = orders.filter((o) => !!o.shippingCountry).length;
  const withSource = orders.filter((o) => !!o.source).length;
  const denom = Math.max(totals.orderCount, 1);
  const healthParts = [
    { label: "Orders with COGS", pct: Math.round((withCogs / denom) * 100), fix: "Open COGS Hub and set missing costs", href: "/dashboard/cogs-hub" },
    { label: "Orders with country", pct: Math.round((withCountry / denom) * 100), fix: "Re-sync stores so shipping addresses import", href: "/dashboard/stores" },
    { label: "Orders with traffic source", pct: Math.round((withSource / denom) * 100), fix: "Use UTM links so attribution can be measured", href: "/dashboard/report-guide#attribution" },
  ];
  const healthScore = Math.round(healthParts.reduce((s, p) => s + p.pct, 0) / healthParts.length);

  // Anomaly feed: simple day-over-day profit swing > 30% in the last 7 days.
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const d = new Date(o.orderDate).toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const anomalies: { date: string; detail: string }[] = [];
  const sortedDays = [...byDay.keys()].sort();
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = byDay.get(sortedDays[i - 1]) ?? 0;
    const cur = byDay.get(sortedDays[i]) ?? 0;
    if (prev > 0 && Math.abs(cur - prev) / prev > 0.3) {
      anomalies.push({ date: sortedDays[i], detail: `Order count moved ${prev} → ${cur} vs the previous day.` });
    }
  }

  return NextResponse.json({
    totals,
    today: todayTotals,
    target,
    targetProgress: target > 0 ? Math.round((todayTotals.netProfit / target) * 100 * 100) / 100 : 0,
    actions,
    leaks,
    integrations,
    anomalies: anomalies.slice(-10),
    healthScore,
    healthParts,
    currencies: [...new Set(orders.map((o) => o.currency ?? "USD"))],
  });
}
