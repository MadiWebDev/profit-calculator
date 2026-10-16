import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { parseBody, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/password";
import { logger, toLogError } from "@/lib/logger";

const VerifySchema = z.object({ token: z.string().min(32).max(256) }).strict();

/**
 * POST /api/auth/verify-email — confirm the email address.
 * Single-use token (hash matched), 24h expiry.
 */
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "auth", "verify-email");
  if (rl) return rl;

  const parsed = await parseBody(req, VerifySchema);
  if ("response" in parsed) return parsed.response;

  const tokenHash = hashToken(parsed.data.token);

  try {
    await connectDB();
    const user = await UserModel.findOne({
      emailVerificationTokenHash: tokenHash,
    }).select("+emailVerificationTokenHash +emailVerificationExpires");

    if (!user) return fail("Invalid or expired verification link", 400, "INVALID_TOKEN");
    if (user.emailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }
    if (user.emailVerificationExpires && new Date() > new Date(user.emailVerificationExpires)) {
      return fail("Verification link expired — request a new one", 410, "TOKEN_EXPIRED");
    }

    user.emailVerified = new Date();
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("email verification failed", toLogError(err));
    return fail("Verification failed", 500, "VERIFY_FAILED");
  }
}
