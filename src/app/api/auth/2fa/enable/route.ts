import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { verifyTotp, generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";
import { decryptAny } from "@/lib/encryption-v2";
import { recordSecurityEvent } from "@/lib/security-events";

const Schema = z.object({ code: z.string().min(6).max(8) }).strict();

/** POST /api/auth/2fa/enable — prove a code, enable 2FA, return recovery codes ONCE. */
export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const parsed = await parseBody(req, Schema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const user = await UserModel.findById(session.userId).select("+twoFactorSecretEncrypted twoFactorEnabled");
  if (!user?.twoFactorSecretEncrypted) {
    return NextResponse.json({ error: "Run setup first" }, { status: 400 });
  }
  const secret = decryptAny(user.twoFactorSecretEncrypted);
  if (!secret || !verifyTotp(secret, parsed.data.code)) {
    await recordSecurityEvent({ teamId: session.teamId, userId: session.userId, type: "two_factor_failed" });
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  const recoveryCodes = generateRecoveryCodes(10);
  user.twoFactorEnabled = true;
  user.twoFactorRecoveryHashes = recoveryCodes.map(hashRecoveryCode);
  await user.save();
  await recordSecurityEvent({ teamId: session.teamId, userId: session.userId, type: "two_factor_enabled" });
  return NextResponse.json({ enabled: true, recoveryCodes });
}
