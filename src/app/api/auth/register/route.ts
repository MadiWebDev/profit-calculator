import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";
import { sendWelcomeEmail, sendVerificationEmail } from "@/lib/email";
import { parseBody, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { checkPasswordPolicy, isPasswordBreached, hashToken } from "@/lib/password";
import { logger, toLogError } from "@/lib/logger";

const RegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.email().max(254).transform((s) => s.toLowerCase().trim()),
    password: z.string().min(10).max(128),
  })
  .strict();

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "auth", "register");
  if (rl) return rl;

  const parsed = await parseBody(req, RegisterSchema);
  if ("response" in parsed) return parsed.response;
  const { name, email, password } = parsed.data;

  // Password policy + breached-password screening
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

    const exists = await UserModel.findOne({ email }).select("_id").lean();
    if (exists) {
      // Don't enumerate: same message as success would be ideal, but the
      // client needs to know — use 409 (standard for register conflicts).
      return fail("Email already registered", 409, "EMAIL_TAKEN");
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await UserModel.create({
      name,
      email,
      password: hashed,
      platformRole: "user",
      role: "owner", // legacy compat — platformRole is the source of truth
      plan: "free",
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      onboardingCompleted: false,
      passwordChangedAt: new Date(),
    });

    // Email verification token (single-use, 24h, hash stored)
    const rawVerify = randomBytes(32).toString("hex");
    user.emailVerificationTokenHash = hashToken(rawVerify);
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    // Personal team/workspace
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40) +
      "-" +
      randomBytes(2).toString("hex");
    const team = await TeamModel.create({
      name: `${name}'s Workspace`,
      slug,
      ownerId: user._id,
      members: [{ userId: user._id, role: "owner", status: "active", invitedAt: new Date() }],
      plan: "free",
      trialEndsAt: user.trialEndsAt,
    });

    await UserModel.findByIdAndUpdate(user._id, { teamId: team._id });

    // Emails — non-blocking, failures logged
    sendWelcomeEmail(user.email, user.name).catch((e) => logger.warn("welcome email failed", {}, toLogError(e)));
    sendVerificationEmail(user.email, user.name, rawVerify).catch((e) =>
      logger.warn("verification email failed", {}, toLogError(e))
    );

    return NextResponse.json({ success: true, userId: user._id.toString() }, { status: 201 });
  } catch (err) {
    logger.error("register failed", toLogError(err));
    return fail("Registration failed", 500, "REGISTER_FAILED");
  }
}
