import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyTrustedDevice } from "@/lib/trusted-device";
import { deviceFingerprint, truncateIp } from "@/lib/security-events";

/**
 * POST /api/auth/2fa/trusted-check — for the 2FA login page: if the
 * caller holds a valid signed trusted-device cookie for this user and
 * device fingerprint, the code step may be skipped. The cookie alone
 * never authenticates — the caller must already hold a valid session
 * (which is why this route uses auth(), not requireAuth).
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = req.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("gpc_trusted_device="))?.split("=")[1];
  if (!token) return NextResponse.json({ trusted: false });
  const ua = req.headers.get("user-agent");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fp = deviceFingerprint(ua, truncateIp(ip));
  return NextResponse.json({ trusted: verifyTrustedDevice(decodeURIComponent(token), userId, fp) });
}
