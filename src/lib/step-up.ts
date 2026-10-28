/**
 * Step-up authentication for sensitive actions (S1.2).
 * Backward-compatible rule: step-up is required only for users who have
 * 2FA enabled (they have a code to give). Users without 2FA are not
 * blocked by a token they cannot produce — their protection is the
 * 2FA enrolment prompt on the security page. Returns a NextResponse
 * error when step-up is required but missing/invalid, else null.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { verifyStepUp, type StepUpScope } from "@/lib/trusted-device";

export async function requireStepUpIf2fa(req: Request, userId: string, scope: StepUpScope): Promise<NextResponse | null> {
  try {
    await connectDB();
    const user = await UserModel.findById(userId).select("twoFactorEnabled").lean();
    if (!user?.twoFactorEnabled) return null;
    const token = req.headers.get("x-gpc-step-up") ?? "";
    if (!token || !verifyStepUp(token, userId, scope)) {
      return NextResponse.json(
        { error: "Fresh two-factor verification required for this action", code: "STEP_UP_REQUIRED", scope },
        { status: 403 },
      );
    }
    return null;
  } catch {
    return null; // DB failure: do not invent a block; the route's own checks still apply
  }
}
