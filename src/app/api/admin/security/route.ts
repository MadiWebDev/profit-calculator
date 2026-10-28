import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/validation";
import SecurityEventModel from "@/models/SecurityEvent";

/**
 * GET /api/admin/security — admin security dashboard data (S5).
 * Team owner/admin only (teamRole enforced by requireAuth via the
 * manage:team permission). Returns 30-day aggregates: failed logins,
 * 2FA failures, permission denials, webhook signature failures,
 * key events, and recent critical events. No raw IPs are returned —
 * events store truncated IPs only.
 */
export async function GET(req: Request) {
  const result = await requireAuth(req, { permission: "manage:team" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  await connectDB();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const teamOid = toObjectId(session.teamId);
  const [byType, recent] = await Promise.all([
    SecurityEventModel.aggregate([
      { $match: { teamId: teamOid, createdAt: { $gte: since } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    SecurityEventModel.find({ teamId: teamOid }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  return NextResponse.json({
    windowDays: 30,
    byType: byType.map((r) => ({ type: r._id, count: r.count })),
    recent: recent.map((e) => ({ type: e.type, at: e.createdAt, ipTruncated: e.ipTruncated, metadata: e.metadata })),
  });
}
