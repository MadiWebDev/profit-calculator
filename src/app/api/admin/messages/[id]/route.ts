/**
 * GET  /api/admin/messages/[id] — one contact message (superAdmin)
 * POST /api/admin/messages/[id] — reply by email (superAdmin)
 *
 * Reply flow: validate the reply, send it via Resend to the sender, and
 * only then mark the message "replied" and write an audit entry. A Resend
 * failure surfaces its exact error and leaves the status untouched.
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import SupportMessageModel from "@/models/SupportMessage";
import { logAdminAudit } from "@/lib/audit";
import { withRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendSupportReplyEmail } from "@/lib/email";
import { SUPPORT_TOPIC_LABELS, type SupportTopic } from "@/lib/support";
import {
  adminReplySchema,
  buildReplySubject,
  buildReplyEmailHtml,
  serializeMessage,
} from "@/lib/admin-messages";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session.user as any).role;
  if (role !== "superAdmin") return null;
  return session;
}

// ── GET /api/admin/messages/[id] ──────────────────────────────────────────────
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(_req, "standard", `message-detail:${adminId}`);
  if (rl) return rl;

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
  }

  await connectDB();
  const doc = await SupportMessageModel.findById(id).lean();
  if (!doc) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  return NextResponse.json({ message: serializeMessage(doc) });
}

// ── POST /api/admin/messages/[id] ─────────────────────────────────────────────
// Body: { message } — the reply text (max 5000 chars).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "standard", `message-reply:${adminId}`);
  if (rl) return rl;

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = adminReplySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid request." },
      { status: 400 },
    );
  }

  await connectDB();
  const doc = await SupportMessageModel.findById(id);
  if (!doc) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  // Send first — the status only flips once the email is really out.
  try {
    await sendSupportReplyEmail(
      doc.email,
      buildReplySubject(doc.topic),
      buildReplyEmailHtml({
        name: doc.name,
        topic: doc.topic,
        originalMessage: doc.message,
        reply: parsed.data.message,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send reply";
    logger.error("[admin/messages] reply send failed", e instanceof Error ? e : new Error(String(e)));
    return NextResponse.json({ error: message }, { status: 502 });
  }

  doc.status = "replied";
  await doc.save();

  await logAdminAudit({
    req,
    session,
    action: "support.replied",
    description: `Replied to support message from ${doc.email} (${SUPPORT_TOPIC_LABELS[doc.topic as SupportTopic]})`,
    resourceType: "SupportMessage",
    resourceId: id,
    metadata: { topic: doc.topic },
  });

  return NextResponse.json({ success: true, message: serializeMessage(doc.toObject()) });
}
