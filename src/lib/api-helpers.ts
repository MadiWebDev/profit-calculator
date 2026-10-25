import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getAccountStatus } from "@/lib/trial";
import { can, getTeamRole, type Permission } from "@/lib/permissions";
import type { TeamRole } from "@/models/Team";

export interface AuthedSession {
  userId: string;
  teamId: string;
  plan: string;
  role: string;       // platform role: "user" | "superAdmin"
  teamRole: TeamRole | null; // team-level role for permission checks
  email: string;
}

/**
 * Combined auth + rate-limit + subscription + permission guard for API routes.
 * Returns the session or a NextResponse error to return early.
 *
 * Options:
 *   rateLimitKey        — key prefix for rate limiting (default: "api")
 *   requireSubscription — when true (default), archived accounts get 402
 *   permission          — team permission required (403 when the caller's
 *                         team role doesn't grant it; viewer is read-only)
 */
export async function requireAuth(
  req: Request,
  options: { rateLimitKey?: string; requireSubscription?: boolean; permission?: Permission } = {}
): Promise<{ session: AuthedSession } | NextResponse> {
  const requireSubscription = options.requireSubscription !== false; // default true

  // Rate limit (may be async when Redis is configured)
  const key = getRateLimitKey(req, options.rateLimitKey ?? "api");
  const rl = await Promise.resolve(rateLimit(key));
  if (!rl.ok) {
    return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(rl.resetAt),
        "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
    });
  }

  // Auth
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as {
    id?: string; teamId?: string; plan?: string; role?: string; teamRole?: TeamRole; email?: string;
    twoFactorPending?: boolean;
  };
  // S1: a session that has not completed 2FA cannot call any API route
  // (the 2FA verify route itself uses auth() directly, not requireAuth).
  if (user.twoFactorPending) {
    return NextResponse.json({ error: "Two-factor verification required", code: "TWO_FACTOR_REQUIRED" }, { status: 403 });
  }
  if (!user.teamId || !user.id) {
    return NextResponse.json({ error: "Incomplete session — complete onboarding" }, { status: 403 });
  }

  // ── CSRF / same-origin gate for cookie-authenticated mutations ─────────────
  // Safe methods (GET/HEAD) are exempt; bearer-authenticated callers are
  // exempt inside verifySameOrigin.
  if (req.method !== "GET" && req.method !== "HEAD") {
    const { verifySameOrigin } = await import("@/lib/csrf");
    const csrfBlock = verifySameOrigin(req);
    if (csrfBlock) return csrfBlock;
  }

  // ── Team permission gate ───────────────────────────────────────────────────
  // When a permission is required, the role is ALWAYS read fresh from the DB
  // — never trusted from the JWT — so demotions/promotions take effect
  // immediately instead of lingering until the next sign-in. The JWT role is
  // only used as a display hint when no permission is being enforced.
  let teamRole: TeamRole | null = null;
  if (options.permission) {
    teamRole = await getTeamRole(user.teamId, user.id);
  } else {
    teamRole = user.teamRole ?? null;
  }
  if (options.permission && !can(teamRole, options.permission)) {
    return NextResponse.json(
      { error: "Forbidden — insufficient team role", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  // ── Subscription / trial gate ──────────────────────────────────────────────
  // Checked server-side on every request — cannot be bypassed from the client.
  if (requireSubscription) {
    const trialInfo = await getAccountStatus(user.teamId);
    if (trialInfo.isArchived) {
      return NextResponse.json(
        {
          error: "Your free trial has expired. Please upgrade to continue.",
          code: "ACCOUNT_ARCHIVED",
          upgradeUrl: "/dashboard",
        },
        { status: 402 }
      );
    }
  }

  return {
    session: {
      userId: user.id,
      teamId: user.teamId,
      plan: user.plan ?? "free",
      role: user.role ?? "user",
      teamRole,
      email: user.email ?? "",
    },
  };
}

/** Check if a session has a minimum plan level */
export function requirePlan(session: AuthedSession, minPlan: "starter" | "growth" | "pro"): NextResponse | null {
  const order = ["free", "starter", "growth", "pro"];
  const userIdx = order.indexOf(session.plan);
  const reqIdx  = order.indexOf(minPlan);
  if (userIdx < reqIdx) {
    return NextResponse.json(
      { error: `This feature requires the ${minPlan} plan or higher.`, upgradeUrl: "/pricing" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Standalone subscription guard — use in routes that call auth() directly
 * instead of requireAuth(). Returns a 402 Response when the account is
 * archived, or null when access is allowed.
 *
 * @example
 *   const block = await checkSubscription(teamId);
 *   if (block) return block;
 */
export async function checkSubscription(teamId: string): Promise<NextResponse | null> {
  const trialInfo = await getAccountStatus(teamId);
  if (trialInfo.isArchived) {
    return NextResponse.json(
      {
        error: "Your free trial has expired. Please upgrade to continue.",
        code: "ACCOUNT_ARCHIVED",
        upgradeUrl: "/dashboard",
      },
      { status: 402 }
    );
  }
  return null;
}
