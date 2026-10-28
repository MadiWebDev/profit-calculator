import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
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
export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  await connectDB();
  const user = await UserModel.findById(session.userId).select("+twoFactorSecretEncrypted twoFactorEnabled");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: "Two-factor is already enabled" }, { status: 400 });
  }
  const secret = generateTotpSecret();
  user.twoFactorSecretEncrypted = encryptV2(secret);
  await user.save();
  return NextResponse.json({ otpauthUrl: totpOtpauthUrl(secret, user.email), secret });
}
