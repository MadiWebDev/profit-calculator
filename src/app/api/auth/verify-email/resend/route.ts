import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { sendVerificationEmail } from "@/lib/email";
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
 * Always returns success to avoid email enumeration; a new single-use
 * 24h token is issued only for existing unverified credential users.
 */
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "auth", "verify-email-resend");
  if (rl) return rl;

  const parsed = await parseBody(req, ResendSchema);
  if ("response" in parsed) return parsed.response;

  try {
    await connectDB();
    const user = await UserModel.findOne({ email: parsed.data.email }).select(
      "+emailVerificationTokenHash +emailVerificationExpires"
    );

    // Only credential users that are still unverified get a new token.
    // (Google OAuth users are verified at creation; everyone else gets the
    // same generic success to avoid enumeration.)
    if (user && user.password && !user.emailVerified) {
      const rawVerify = randomBytes(32).toString("hex");
      user.emailVerificationTokenHash = hashToken(rawVerify);
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();
      sendVerificationEmail(user.email, user.name, rawVerify).catch((e) =>
        logger.warn("verification resend failed", {}, toLogError(e))
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("verification resend failed", toLogError(err));
    return fail("Could not resend verification email", 500, "RESEND_FAILED");
  }
}
