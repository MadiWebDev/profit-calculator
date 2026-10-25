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
  const [byBand, byStatus, money, rto] = await Promise.all([
    OrderModel.aggregate([
      { $match: { teamId, riskScore: { $exists: true } } },
      { $group: { _id: "$riskBand", count: { $sum: 1 } } },
    ]),
    OrderModel.aggregate([
      { $match: { teamId, riskScore: { $exists: true } } },
      { $group: { _id: "$riskStatus", count: { $sum: 1 } } },
    ]),
    OrderModel.aggregate([
      { $match: { teamId, riskStatus: "fake" } },
      { $group: { _id: null, moneySaved: { $sum: "$moneySaved" }, valueProtected: { $sum: "$grossRevenue" } } },
    ]),
    OrderModel.aggregate([
      { $match: { teamId } },
      { $group: { _id: null, rtoLoss: { $sum: "$rtoLoss" } } },
    ]),
  ]);
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
    moneySaved: money[0]?.moneySaved ?? 0,
    valueProtected: money[0]?.valueProtected ?? 0,
    realisedRtoLoss: rto[0]?.rtoLoss ?? 0,
    generatedAt: new Date().toISOString(),
  });
}
