/**
 * GET /api/risk/stats — Phase 4 precision + money-saved metrics.
 *
 * Precision = fake verdicts / (fake + genuine verdicts) over reviewed
 * orders. It measures how often the merchant agreed with a "fake"
 * call — it is NOT the engine's accuracy on all orders, because only
 * reviewed orders have a verdict. Money saved = sum of gross value
 * protected on fake-reviewed orders (engine's preventedFakeValue);
 * realised RTO loss is reported separately and never mixed in.
 */
import { NextResponse } from "next/server";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { toObjectId } from "@/lib/validation";
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "risk-stats");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;

  await connectDB();
  const teamId = toObjectId(session.teamId);
  // Band/status counts are currency-free, so the $group aggregations
  // stay. The money stats must NOT be $sums: a Mongo $sum cannot
  // convert, so a multi-currency team got 1:1 mixed-currency totals
  // labelled as base currency. Fetch the contributing orders and
  // convert each one into the report base currency before summing —
  // the same rule P&L / LTV follow. (The backfill 100-cap UX is
  // Phase 2 #23, deliberately untouched here.)
  const [byBand, byStatus, fakeOrders, rtoOrders] = await Promise.all([
    OrderModel.aggregate([
      { $match: { teamId, riskScore: { $exists: true } } },
      { $group: { _id: "$riskBand", count: { $sum: 1 } } },
    ]),
    OrderModel.aggregate([
      { $match: { teamId, riskScore: { $exists: true } } },
      { $group: { _id: "$riskStatus", count: { $sum: 1 } } },
    ]),
    OrderModel.find({ teamId, riskStatus: "fake" })
      .select("moneySaved grossRevenue currency")
      .lean(),
    OrderModel.find({ teamId, rtoLoss: { $exists: true, $ne: 0 } })
      .select("rtoLoss currency")
      .lean(),
  ]);
  const base = await getReportBaseCurrency(session.teamId);
  const rates = await getReportRates(base);
  const n = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const cur = (o: { currency?: unknown }): string | undefined =>
    typeof o.currency === "string" ? o.currency : undefined;
  const moneySaved = fakeOrders.reduce(
    (s, o) => s + convertAmount(n(o.moneySaved), cur(o), base, rates), 0);
  const valueProtected = fakeOrders.reduce(
    (s, o) => s + convertAmount(n(o.grossRevenue), cur(o), base, rates), 0);
  const realisedRtoLoss = rtoOrders.reduce(
    (s, o) => s + convertAmount(n(o.rtoLoss), cur(o), base, rates), 0);
  const bandCounts: Record<string, number> = {};
  for (const b of byBand as { _id: string; count: number }[]) bandCounts[b._id ?? "unknown"] = b.count;
  const statusCounts: Record<string, number> = {};
  for (const b of byStatus as { _id: string; count: number }[]) statusCounts[b._id ?? "unknown"] = b.count;
  const fake = statusCounts.fake ?? 0;
  const genuine = statusCounts.genuine ?? 0;
  const reviewed = fake + genuine;
  return NextResponse.json({
    byBand: bandCounts,
    byStatus: statusCounts,
    reviewed,
    precision: reviewed > 0 ? Math.round((fake / reviewed) * 100 * 100) / 100 : 0,
    moneySaved,
    valueProtected,
    realisedRtoLoss,
    generatedAt: new Date().toISOString(),
  });
}
