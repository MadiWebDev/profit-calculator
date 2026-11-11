/**
 * GET   /api/admin/messages — paginated contact-message inbox (superAdmin)
 * PATCH /api/admin/messages — set a message's status (superAdmin)
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import SupportMessageModel from "@/models/SupportMessage";
import { logAudit } from "@/lib/audit";
import {
  parseMessagesQuery,
  buildMessagesFilter,
  adminMessageStatusSchema,
  serializeMessage,
  MESSAGE_STATUSES,
} from "@/lib/admin-messages";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session.user as any).role;
  if (role !== "superAdmin") return null;
  return session;
}

/**
 * Audit entries need a real teamId + userId. The superAdmin's session
 * carries both when they belong to a team; when it doesn't (team-less
 * superAdmin), skip the audit entry instead of writing a broken one —
 * logAudit itself never throws, but the ObjectId cast before it would.
 */
function auditIds(session: Awaited<ReturnType<typeof requireSuperAdmin>>) {
  if (!session?.user) return null;
  const user = session.user as { id?: string; teamId?: string };
  if (!user.id || !user.teamId) return null;
  if (!mongoose.isValidObjectId(user.id) || !mongoose.isValidObjectId(user.teamId)) return null;
  return {
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id),
  };
}

// ── GET /api/admin/messages ───────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const query = parseMessagesQuery(new URL(req.url).searchParams);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = buildMessagesFilter(query);

  await connectDB();

  const [docs, total, stats] = await Promise.all([
    SupportMessageModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    SupportMessageModel.countDocuments(filter),
    SupportMessageModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  const counts: Record<string, number> = Object.fromEntries(
    MESSAGE_STATUSES.map((s) => [s, 0]),
  );
  for (const s of stats as Array<{ _id: string; count: number }>) {
    if (s._id in counts) counts[s._id] = s.count;
  }

  return NextResponse.json({
    messages: docs.map(serializeMessage),
    total,
    page: query.page,
    pages: Math.ceil(total / query.limit),
    stats: counts,
  });
}

// ── PATCH /api/admin/messages ─────────────────────────────────────────────────
// Body: { messageId, status } — status is one of new | replied | closed.
export async function PATCH(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = adminMessageStatusSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid request." },
      { status: 400 },
    );
  }
  const { messageId, status } = parsed.data;

  if (!mongoose.isValidObjectId(messageId)) {
    return NextResponse.json({ error: "Invalid messageId" }, { status: 400 });
  }

  await connectDB();

  const updated = await SupportMessageModel.findByIdAndUpdate(
    messageId,
    { $set: { status } },
    { new: true },
  ).lean();

  if (!updated) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const ids = auditIds(session);
  if (ids) {
    await logAudit({
      ...ids,
      action: "support.status_changed",
      description: `Changed support message ${messageId} status to ${status}`,
      resourceType: "SupportMessage",
      resourceId: messageId,
      metadata: { status },
    });
  }

  return NextResponse.json({ success: true, message: serializeMessage(updated) });
}
