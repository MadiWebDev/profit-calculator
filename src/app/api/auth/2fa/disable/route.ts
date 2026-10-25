import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { verifyTotp } from "@/lib/totp";
import { decryptAny } from "@/lib/encryption-v2";
import { recordSecurityEvent } from "@/lib/security-events";

const Schema = z.object({ password: z.string().min(1), code: z.string().min(6).max(8) }).strict();

/** POST /api/auth/2fa/disable — requires password + a valid TOTP code. */
export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const parsed = await parseBody(req, Schema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const user = await UserModel.findById(session.userId).select("+password +twoFactorSecretEncrypted twoFactorEnabled");
  if (!user?.password || !(await bcrypt.compare(parsed.data.password, user.password))) {
    return NextResponse.json({ error: "Invalid password" }, { status: 400 });
  }
  const secret = decryptAny(user.twoFactorSecretEncrypted);
  if (!user.twoFactorEnabled || !secret || !verifyTotp(secret, parsed.data.code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  user.twoFactorEnabled = false;
  user.twoFactorSecretEncrypted = undefined;
  user.twoFactorRecoveryHashes = [];
  await user.save();
  await recordSecurityEvent({ teamId: session.teamId, userId: session.userId, type: "two_factor_disabled" });
  return NextResponse.json({ disabled: true });
}
