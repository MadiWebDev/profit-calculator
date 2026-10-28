import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseBody } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { verifyTotp, generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";
import { decryptAny } from "@/lib/encryption-v2";
import { recordSecurityEvent } from "@/lib/security-events";

const Schema = z.object({ code: z.string().min(6).max(8) }).strict();

/** POST /api/auth/2fa/enable — prove a code, enable 2FA, return recovery codes ONCE. */
export async function POST(req: Request) {
  // auth() directly, not requireAuth: enrolment must work for pending
  // sessions (team-enforced members), same pattern as /api/auth/2fa/verify.
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId || !session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionTeamId = (session.user as { teamId?: string }).teamId ?? "";
  const parsed = await parseBody(req, Schema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const user = await UserModel.findById(userId).select("+twoFactorSecretEncrypted twoFactorEnabled");
  if (!user?.twoFactorSecretEncrypted) {
    return NextResponse.json({ error: "Run setup first" }, { status: 400 });
  }
  const secret = decryptAny(user.twoFactorSecretEncrypted);
  if (!secret || !verifyTotp(secret, parsed.data.code)) {
    await recordSecurityEvent({ teamId: sessionTeamId, userId, type: "two_factor_failed" });
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  const recoveryCodes = generateRecoveryCodes(10);
  user.twoFactorEnabled = true;
  user.twoFactorRecoveryHashes = recoveryCodes.map(hashRecoveryCode);
  await user.save();
  await recordSecurityEvent({ teamId: sessionTeamId, userId, type: "two_factor_enabled" });
  return NextResponse.json({ enabled: true, recoveryCodes });
}
