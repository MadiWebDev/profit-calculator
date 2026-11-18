import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { verificationStatusFor } from "@/lib/email-verification";
import { withRateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/validation";

const StatusQuery = z.object({
  email: z.email().max(254).transform((s) => s.toLowerCase().trim()),
});

/**
 * GET /api/auth/verification-status?email=… — has this email been verified?
 *
 * Read by the register page's verification modal, which polls it while the
 * user is in their inbox clicking the link; when it flips to true the modal
 * redirects to sign-in. Unknown email and unverified account both answer
 * `{ verified: false }`, so the endpoint can't be used to enumerate
 * accounts.
 */
export async function GET(req: Request) {
  // `standard` (100/min per IP), NOT the `auth` preset (10 per 10 min):
  // the modal polls every 5s (12/min), and under `auth` it would 429
  // after ~50s — exactly when a real user is still in their inbox — and
  // the modal would never learn the email was verified. The endpoint is
  // a cheap indexed read with a coarse answer (unknown → false), so the
  // looser preset is the safe one here.
  const rl = await withRateLimit(req, "standard", "verification-status");
  if (rl) return rl;

  const raw = new URL(req.url).searchParams.get("email");
  const parsed = StatusQuery.safeParse({ email: raw });
  if (!parsed.success) return fail("A valid email is required", 400, "INVALID_EMAIL");

  try {
    await connectDB();
    const user = await UserModel.findOne({ email: parsed.data.email }).select("emailVerified");
    return NextResponse.json(verificationStatusFor(user));
  } catch {
    return fail("Could not check verification status", 500, "STATUS_FAILED");
  }
}
