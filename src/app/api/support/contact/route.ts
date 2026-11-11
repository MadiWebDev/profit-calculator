import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import SupportMessageModel from "@/models/SupportMessage";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import {
  SUPPORT_EMAIL,
  SUPPORT_TOPIC_LABELS,
  buildSupportEmailHtml,
  isHoneypotFilled,
  validateSupportSubmission,
} from "@/lib/support";

/**
 * POST /api/support/contact — public Help Center contact form.
 *
 * 1. Rate-limit: 5 submissions per IP per 10 minutes (public form).
 * 2. Validate with the shared zod schema (same rules the form shows).
 * 3. Honeypot filled → pretend success, store nothing (bot trap).
 * 4. Record the submission in MongoDB — this is the durable record.
 * 5. Best-effort: email it to the support inbox via Resend. Email
 *    failure never loses the message: it stays stored with emailSent
 *    false, and the route still answers 201.
 */
export async function POST(req: Request) {
  const rl = await Promise.resolve(
    rateLimit(getRateLimitKey(req, "support-contact"), { max: 5, windowMs: 10 * 60 * 1000 }),
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many messages — please wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = validateSupportSubmission(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid request." },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Bot trap: accept silently so the bot learns nothing.
  if (isHoneypotFilled(data)) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // Attach the sender's account when they are signed in — helps support
  // look up the store, but the form works logged out too.
  let userId: string | undefined;
  try {
    const session = await auth();
    if (session?.user?.id) userId = session.user.id;
  } catch {
    // Logged-out senders have no session; the message is still recorded.
  }

  try {
    await connectDB();
  } catch (e) {
    logger.error("[support/contact] database unavailable", e instanceof Error ? e : new Error(String(e)));
    return NextResponse.json(
      { error: "We couldn't save your message right now. Please email us directly at hello@getprofitcalc.com." },
      { status: 503 },
    );
  }

  const created = await SupportMessageModel.create({
    name: data.name,
    email: data.email,
    topic: data.topic,
    message: data.message,
    ...(userId ? { userId } : {}),
    userAgent: req.headers.get("user-agent")?.slice(0, 256),
    status: "new",
    emailSent: false,
  });

  let emailSent = false;
  try {
    const { sendSupportMessageEmail } = await import("@/lib/email");
    await sendSupportMessageEmail(
      SUPPORT_EMAIL,
      `[Support] ${SUPPORT_TOPIC_LABELS[data.topic]} — ${data.name}`,
      buildSupportEmailHtml(data),
    );
    emailSent = true;
    await SupportMessageModel.updateOne({ _id: created._id }, { emailSent: true });
  } catch (e) {
    // Resend not configured (or send failed): the message is safely
    // stored above — support can still find it. Don't fail the request.
    logger.warn("[support/contact] email delivery failed — message stored only", e instanceof Error ? e : undefined);
  }

  return NextResponse.json({ ok: true, id: String(created._id), emailSent }, { status: 201 });
}
