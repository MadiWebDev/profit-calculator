/**
 * Shared guard for cron routes (Vercel Cron / external schedulers).
 *
 * Callers must send:  Authorization: Bearer <CRON_SECRET>
 * Comparison uses crypto.timingSafeEqual to avoid timing oracles.
 *
 * Usage at the top of a cron route handler:
 *   const unauthorized = verifyCronAuth(req);
 *   if (unauthorized) return unauthorized;
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/** Returns a 401 NextResponse when the cron secret is missing/invalid, else null. */
export function verifyCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!presented) {
    return NextResponse.json({ error: "Missing cron authorization" }, { status: 401 });
  }

  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(secret, "utf8");
  const valid = a.length === b.length && timingSafeEqual(a, b);

  if (!valid) {
    return NextResponse.json({ error: "Invalid cron authorization" }, { status: 401 });
  }
  return null;
}
