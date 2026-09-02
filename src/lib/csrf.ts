/**
 * CSRF protection for state-mutating API routes (non-GET, non-webhook).
 *
 * Strategy: Double-Submit Cookie pattern.
 * - A `csrf-token` cookie is set on the client (HttpOnly=false so JS can read it).
 * - Every mutating request must send the same value in the `x-csrf-token` header.
 * - The server reads both and verifies they match using a timing-safe comparison.
 *
 * NextAuth's own routes are already CSRF-protected by next-auth.
 * Billing webhooks are excluded (verified via HMAC instead).
 *
 * Usage in an API route:
 *   const csrfErr = verifyCsrf(req);
 *   if (csrfErr) return csrfErr;
 *
 * Usage in a client component / fetch call — add this header:
 *   headers: { "x-csrf-token": getCookie("csrf-token") ?? "" }
 *
 * The cookie is set by the dashboard layout's server component calling
 * setCsrfCookie(response) or via the /api/auth/csrf route that next-auth exposes.
 *
 * NOTE: For Next.js App Router + same-origin requests with SameSite=Strict cookies,
 * CSRF risk is already low. This adds defence-in-depth.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual, randomBytes } from "crypto";

/** Generate a cryptographically random CSRF token (hex string) */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Verify the CSRF token from the request header matches the cookie.
 * Returns null if valid, or a 403 NextResponse if invalid.
 *
 * Skip verification in development unless explicitly enabled
 * (avoids breaking local workflows during development).
 */
export function verifyCsrf(req: Request): NextResponse | null {
  // Skip in dev unless ENFORCE_CSRF=true
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ENFORCE_CSRF !== "true"
  ) {
    return null;
  }

  const headerToken = req.headers.get("x-csrf-token");
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieToken = parseCsrfCookie(cookieHeader);

  if (!headerToken || !cookieToken) {
    return NextResponse.json({ error: "CSRF token missing" }, { status: 403 });
  }

  try {
    const a = Buffer.from(headerToken, "hex");
    const b = Buffer.from(cookieToken, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "CSRF token mismatch" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "CSRF token invalid" }, { status: 403 });
  }

  return null;
}

function parseCsrfCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return match ? match[1] : null;
}
