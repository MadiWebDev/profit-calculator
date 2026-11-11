import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { sendVerificationEmail } from "@/lib/email";
import { shouldIssueVerificationToken } from "@/lib/email-verification";
import { parseBody, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/password";
import { logger, toLogError } from "@/lib/logger";

const ResendSchema = z
  .object({
    email: z.email().max(254).transform((s) => s.toLowerCase().trim()),
  })
  .strict();

/**
 * POST /api/auth/verify-email/resend — re-send the verification email.
 * Always returns a generic success to avoid email enumeration; a new
 * single-use 24h token is issued only for existing unverified credential
 * users. The response distinguishes what the UI may honestly claim:
 * - `{ delivered: true }` — a token was issued AND the provider accepted
 *   the email (the only case where "sent" may be shown).
 * - `{ delivered: false }` — no token was issued (unknown email, already
 *   verified, OAuth account); the UI must stay neutral here.
 * - 502 / SEND_FAILED — a token was issued but the provider rejected the
 *   send; the UI must report the failure, not claim success.
 */
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "auth", "verify-email-resend");
  if (rl) return rl;

  const parsed = await parseBody(req, ResendSchema);
  if ("response" in parsed) return parsed.response;

  try {
    await connectDB();
    // +password is required: without it the token-issuing check below can
    // never be true (password is select: false on the schema) and resends
    // silently did nothing while the client claimed success.
    const user = await UserModel.findOne({ email: parsed.data.email }).select(
      "+password +emailVerificationTokenHash +emailVerificationExpires"
    );

    // Only credential users that are still unverified get a new token.
    // (Google OAuth users are verified at creation; everyone else gets the
    // same generic success to avoid enumeration.)
    if (shouldIssueVerificationToken(user)) {
      const rawVerify = randomBytes(32).toString("hex");
      user.emailVerificationTokenHash = hashToken(rawVerify);
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();
      try {
        // Await the send: a failure must reach the caller instead of being
        // swallowed by a fire-and-forget .catch() that returns success.
        await sendVerificationEmail(user.email, user.name, rawVerify);
      } catch (e) {
        logger.warn("verification resend failed", {}, toLogError(e));
        return fail("Could not send the verification email", 502, "SEND_FAILED");
      }
      return NextResponse.json({ success: true, delivered: true });
    }

    return NextResponse.json({ success: true, delivered: false });
  } catch (err) {
    logger.error("verification resend failed", toLogError(err));
    return fail("Could not resend verification email", 500, "RESEND_FAILED");
  }
}
