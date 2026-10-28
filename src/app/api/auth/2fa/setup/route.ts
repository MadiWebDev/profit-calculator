import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { generateTotpSecret, totpOtpauthUrl } from "@/lib/totp";
import { encryptV2 } from "@/lib/encryption-v2";

/**
 * POST /api/auth/2fa/setup — start TOTP enrolment. Returns the otpauth URL
 * (rendered as a QR code by the client) and the secret once. The secret is
 * stored AES-256-GCM encrypted with twoFactorEnabled=false until /enable
 * proves the user can generate a valid code. Re-running setup replaces
 * the pending secret; it never disables an already-enabled 2FA.
 */
export async function POST() {
  // auth() directly, not requireAuth: enrolment must work for pending
  // sessions — team-enforced members arrive here with twoFactorPending
  // set and no secret yet (same pattern as /api/auth/2fa/verify).
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const user = await UserModel.findById(userId).select("+twoFactorSecretEncrypted twoFactorEnabled");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: "Two-factor is already enabled" }, { status: 400 });
  }
  const secret = generateTotpSecret();
  user.twoFactorSecretEncrypted = encryptV2(secret);
  await user.save();
  return NextResponse.json({ otpauthUrl: totpOtpauthUrl(secret, user.email), secret });
}
