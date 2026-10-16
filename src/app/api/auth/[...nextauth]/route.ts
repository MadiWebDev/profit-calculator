import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { withRateLimit, rateLimitPreset } from "@/lib/rate-limit";

export const GET = handlers.GET;

function tooManyRequests(resetAt: number, limit: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetAt),
        "Retry-After": String(retryAfter),
      },
    }
  );
}

/**
 * POST wrapper adding brute-force protection to the credentials login
 * endpoint (POST /api/auth/callback/credentials), which otherwise has no
 * throttling of its own:
 *
 *  1. Per-IP bucket (auth preset: 10 req / 10 min) — slows single-source
 *     password spraying across many accounts.
 *  2. Per-email bucket (auth preset: 10 req / 10 min, IP-independent) —
 *     slows distributed guessing against one account. The DB-backed lockout
 *     (5 consecutive failures → 15 min) in authorize() remains the strong
 *     per-account backstop.
 *
 * The body is parsed from a CLONE so the downstream NextAuth handler still
 * receives the intact request.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  if (url.pathname.endsWith("/callback/credentials")) {
    // 1. Per-IP throttle
    const ipBlock = await withRateLimit(req, "auth", "login");
    if (ipBlock) return ipBlock;

    // 2. Per-email throttle
    try {
      const clone = req.clone();
      const ct = clone.headers.get("content-type") ?? "";
      let email = "";
      if (ct.includes("application/x-www-form-urlencoded")) {
        email = new URLSearchParams(await clone.text()).get("email") ?? "";
      } else if (ct.includes("application/json")) {
        const body = (await clone.json()) as { email?: unknown };
        if (typeof body.email === "string") email = body.email;
      }
      email = email.toLowerCase().trim().slice(0, 254);
      if (email) {
        const rl = await Promise.resolve(rateLimitPreset(`login-email:${email}`, "auth"));
        if (!rl.ok) return tooManyRequests(rl.resetAt, rl.limit);
      }
    } catch {
      // Malformed body — let NextAuth itself reject it.
    }
  }

  return handlers.POST(req);
}
