/**
 * GET /api/admin/suppressions — the suppression list for the Campaign
 * Center's Suppression tab (Phase 3). Every entry is a real record
 * from the Phase 1 MessageSuppression model: who is blocked, on which
 * channel, why, and where it came from. superAdmin-only.
 *
 * Query: ?page &limit (default 20) &channel=email|whatsapp|all
 * &q (identifier search, regex-escaped).
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import MessageSuppressionModel from "@/models/MessageSuppression";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { escapeRegex } from "@/lib/campaigns";

export async function GET(req: NextRequest) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "standard", `suppressions-list:${adminId}`);
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const channel = searchParams.get("channel") ?? "";
  const q = searchParams.get("q")?.trim() ?? "";
  if (channel && !["email", "whatsapp", "all"].includes(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const filter: Record<string, unknown> = {};
  if (channel && channel !== "all") filter.channel = channel;
  if (q) filter.identifier = { $regex: escapeRegex(q), $options: "i" };

  await connectDB();
  const [rows, total] = await Promise.all([
    MessageSuppressionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MessageSuppressionModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    suppressions: rows.map((r) => ({
      id: r._id.toString(),
      identifier: r.identifier,
      channel: r.channel,
      reason: r.reason,
      source: r.source,
      campaignId: r.campaignId?.toString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
