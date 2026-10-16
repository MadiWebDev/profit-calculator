import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { sendPasswordResetEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/password";
import { logger, toLogError } from "@/lib/logger";
import { parseBody } from "@/lib/validation";

const ForgotSchema = z.object({ email: z.email().max(254) }).strict();

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "auth", "forgot-password");
  if (rl) return rl;

  const parsed = await parseBody(req, ForgotSchema);
  if ("response" in parsed) return parsed.response;
  const email = parsed.data.email.toLowerCase().trim();

  try {
    await connectDB();

    const user = await UserModel.findOne({ email }).select(
      "+resetPasswordTokenHash +resetPasswordExpires +password"
    );

    // Always return success to prevent email enumeration.
    // OAuth-only users have no password — silently skip them too.
    if (user?.password) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      user.resetPasswordTokenHash = hashToken(rawToken);
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      try {
        await sendPasswordResetEmail(user.email, user.name, rawToken);
      } catch (e) {
        logger.error("password reset email failed", toLogError(e));
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("forgot-password failed", toLogError(err));
    // Still return success to avoid enumeration via error timing
    return NextResponse.json({ success: true });
  }
}
