import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { parseBody, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { checkPasswordPolicy, isPasswordBreached, hashToken } from "@/lib/password";
import { logger, toLogError } from "@/lib/logger";

const ResetSchema = z
  .object({
    token: z.string().min(32).max(256),
    password: z.string().min(10).max(128),
  })
  .strict();

/**
 * POST /api/auth/reset-password — set a new password from a reset token.
 * Single-use: the token hash is cleared on success. passwordChangedAt is
 * bumped so existing sessions are invalidated (checked in the JWT callback).
 */
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "auth", "reset-password");
  if (rl) return rl;

  const parsed = await parseBody(req, ResetSchema);
  if ("response" in parsed) return parsed.response;
  const { token, password } = parsed.data;

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) return fail(policy.reason ?? "Weak password", 400, "WEAK_PASSWORD");
  if (await isPasswordBreached(password)) {
    return fail(
      "This password has appeared in a data breach. Please choose a different one.",
      400,
      "BREACHED_PASSWORD"
    );
  }

  try {
    await connectDB();

    const user = await UserModel.findOne({
      resetPasswordTokenHash: hashToken(token),
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordTokenHash +resetPasswordExpires +password");

    if (!user) {
      return fail("Reset link is invalid or has expired", 400, "INVALID_TOKEN");
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    user.passwordChangedAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("reset-password failed", toLogError(err));
    return fail("Something went wrong", 500, "RESET_FAILED");
  }
}
