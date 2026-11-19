/**
 * POST /api/admin/direct-messages — send one message to one user, no
 * campaign. superAdmin-only. The Campaign Center user directory's
 * Message button opens the dialog; this is the send behind it.
 *
 * Body (strict): { userId, channel: "email" | "whatsapp",
 *   subject?, body?, whatsappTemplateName? } — email needs a body,
 *   WhatsApp needs a Meta-approved template name (never free text).
 * Refusals before any provider call (suppressed, unsubscribed, no
 * phone, invalid template, missing credentials) answer 4xx/503 and
 * create NO record. A provider rejection creates a FAILED record with
 * the provider's exact error. Response: { success, id, status,
 * providerMessageId?, error? }.
 *
 * GET /api/admin/direct-messages — the sent-direct-messages list for
 * the Campaign Center's Messages tab. Query: ?page &limit (default 20,
 * cap 50) &channel=email|whatsapp.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import DirectMessageModel from "@/models/DirectMessage";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validation";
import { logAdminAudit } from "@/lib/audit";
import {
  DirectMessageBodySchema,
  DirectMessageError,
  sendDirectMessage,
} from "@/lib/direct-messages";

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "strict", `direct-message:${adminId}`);
  if (rl) return rl;

  const parsed = await parseBody(req, DirectMessageBodySchema);
  if ("response" in parsed) return parsed.response;
  const data = parsed.data;

  try {
    const doc = await sendDirectMessage(data, { createdBy: adminId });
    await logAdminAudit({
      req,
      session,
      action: doc.status === "sent" ? "direct_message.sent" : "direct_message.failed",
      description:
        `Direct message to ${doc.userName} (${doc.channel}): ${doc.status}` +
        (doc.error ? ` — ${doc.error}` : ""),
      resourceType: "DirectMessage",
      resourceId: doc._id.toString(),
      metadata: {
        userId: doc.userId.toString(),
        channel: doc.channel,
        ...(doc.providerMessageId ? { providerMessageId: doc.providerMessageId } : {}),
      },
    });
    return NextResponse.json({
      success: true,
      id: doc._id.toString(),
      status: doc.status,
      ...(doc.providerMessageId ? { providerMessageId: doc.providerMessageId } : {}),
      ...(doc.error ? { error: doc.error } : {}),
    });
  } catch (e) {
    if (e instanceof DirectMessageError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "standard", `direct-messages-list:${adminId}`);
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const channel = searchParams.get("channel") ?? "";
  if (channel && !["email", "whatsapp"].includes(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const filter: Record<string, unknown> = {};
  if (channel) filter.channel = channel;

  await connectDB();
  const [rows, total] = await Promise.all([
    DirectMessageModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DirectMessageModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    directMessages: rows.map((r) => ({
      id: r._id.toString(),
      userId: r.userId.toString(),
      identifier: r.identifier,
      userName: r.userName,
      channel: r.channel,
      subject: r.subject,
      body: r.body,
      whatsappTemplateName: r.whatsappTemplateName ?? null,
      status: r.status,
      providerMessageId: r.providerMessageId ?? null,
      error: r.error ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}
