import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseBody } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { verifyTotp, verifyRecoveryCode } from "@/lib/totp";
import { decryptAny } from "@/lib/encryption-v2";
import { recordSecurityEvent } from "@/lib/security-events";
import { signTrustedDevice, signStepUp, type StepUpScope, STEP_UP_SCOPES } from "@/lib/trusted-device";
import { deviceFingerprint, truncateIp } from "@/lib/security-events";

const Schema = z.object({
  code: z.string().min(6).max(32),
  rememberDevice: z.boolean().optional().default(false),
  stepUpScope: z.enum(STEP_UP_SCOPES).optional(),
}).strict();

/**
 * POST /api/auth/2fa/verify — used by BOTH flows, so it uses auth()
 * directly (not requireAuth, which rejects twoFactorPending sessions):
 *  (a) login-time 2FA: clears the pending flag client-side via
 *      useSession().update({ user: { twoFactorPending: false } });
 *  (b) step-up: returns a signed step-up token for the requested scope.
 * Accepts a TOTP code or a single-use recovery code (consumed on use).
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId || !session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionTeamId = (session.user as { teamId?: string }).teamId;
  const parsed = await parseBody(req, Schema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const user = await UserModel.findById(userId).select("+twoFactorSecretEncrypted twoFactorEnabled twoFactorRecoveryHashes");
  if (!user?.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
    return NextResponse.json({ error: "Two-factor is not enabled" }, { status: 400 });
  }
  const secret = decryptAny(user.twoFactorSecretEncrypted);
  let ok = secret ? verifyTotp(secret, parsed.data.code) : false;
  let usedRecovery = false;
  if (!ok) {
    const idx = verifyRecoveryCode(parsed.data.code, user.twoFactorRecoveryHashes ?? []);
    if (idx >= 0) {
      ok = true;
      usedRecovery = true;
      user.twoFactorRecoveryHashes.splice(idx, 1);
      await user.save();
    }
  }
  if (!ok) {
    await recordSecurityEvent({ teamId: sessionTeamId, userId, type: "two_factor_failed" });
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  if (usedRecovery) {
    await recordSecurityEvent({ teamId: sessionTeamId, userId, type: "recovery_code_used" });
  }
  const res: Record<string, unknown> = { ok: true, usedRecovery };
  const ua = req.headers.get("user-agent");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fp = deviceFingerprint(ua, truncateIp(ip));
  if (parsed.data.rememberDevice) {
    const token = signTrustedDevice(userId, fp);
    res.trustedDeviceToken = token;
    // Also persist the trusted device for the sessions page.
    const { default: SessionDeviceModel } = await import("@/models/SessionDevice");
    await SessionDeviceModel.findOneAndUpdate(
      { userId, deviceFingerprint: fp },
      { $set: { trustedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), lastSeenAt: new Date(), userAgent: ua?.slice(0, 300), ipTruncated: truncateIp(ip) } },
      { upsert: true },
    );
  }
  if (parsed.data.stepUpScope) {
    res.stepUpToken = signStepUp(userId, parsed.data.stepUpScope as StepUpScope);
  }
  const response = NextResponse.json(res);
  if (parsed.data.rememberDevice && res.trustedDeviceToken) {
    response.cookies.set("gpc_trusted_device", String(res.trustedDeviceToken), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60,
    });
  }
  return response;
}
