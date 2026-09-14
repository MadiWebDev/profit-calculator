import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";

export interface AuthedSession {
  userId: string;
  teamId: string;
  plan: string;
  role: string;
  email: string;
}

/**
 * Combined auth + rate-limit guard for API routes.
 * Returns the session or a NextResponse error to return early.
 */
export async function requireAuth(
  req: Request,
  options: { rateLimitKey?: string } = {}
): Promise<{ session: AuthedSession } | NextResponse> {
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
    id?: string; teamId?: string; plan?: string; role?: string; email?: string;
  };
  if (!user.teamId || !user.id) {
    return NextResponse.json({ error: "Incomplete session — complete onboarding" }, { status: 403 });
  }

  return {
    session: {
      userId: user.id,
      teamId: user.teamId,
      plan: user.plan ?? "free",
      role: user.role ?? "owner",
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
