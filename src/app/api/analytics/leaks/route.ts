/**
 * GET /api/analytics/leaks — Profit Leak Detector feeding Mission
 * Control: loss-making campaigns, negative-margin products, missing
 * COGS, stuck shipments, unreviewed high-risk orders. Each finding
 * carries its amount and a deep link; nothing is invented.
 */
import { NextResponse } from "next/server";
import { getReportContext, loadReportOrders } from "@/lib/report-server";
import { summarizeOrders, detectLeaks } from "@/lib/parity-reports";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/validation";
import ShipmentModel from "@/models/Shipment";
import CogsRuleModel from "@/models/CogsRule";
import ProductModel from "@/models/Product";
import OrderModel from "@/models/Order";

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "analytics-leaks");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);
  await connectDB();
  const teamOid = toObjectId(ctx.session.teamId);
  const [shipments, products, cogsRules, highRisk] = await Promise.all([
    ShipmentModel.find({ teamId: teamOid }).lean(),
    ProductModel.find({ teamId: teamOid }).lean(),
    CogsRuleModel.find({ teamId: teamOid }).lean(),
    OrderModel.countDocuments({ teamId: teamOid, riskBand: { $in: ["high", "critical"] }, riskStatus: "unreviewed" }),
  ]);
  const stuck = shipments.filter((s) => {
    const updated = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    return s.status !== "delivered" && s.status !== "returned_rto" && s.status !== "cancelled" && Date.now() - updated > 5 * 864e5;
  }).length;
  const cogsIds = new Set(cogsRules.map((r) => r.productId));
  const missingCogs = products.filter((p) => !p.defaultCogs && (!p.externalId || !cogsIds.has(p.externalId))).length;
  const leaks = detectLeaks({ orders, missingCogsProducts: missingCogs, stuckShipments: stuck, highRiskUnreviewed: highRisk });
  return NextResponse.json({ totals, leaks, totalAtRisk: Math.round(leaks.reduce((s, l) => s + l.amount, 0) * 100) / 100 });
}
