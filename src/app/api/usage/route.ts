import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { getEffectivePlan, getUsage, usageRatio } from "@/lib/entitlements";
import { getPlanLimits, type PlanId } from "@/lib/plans";

/**
 * GET /api/usage
 *
 * Returns the team's effective plan, limits, current usage and per-limit
 * usage ratios for the <UsageMeter/> sidebar widget.
 */
export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "usage", requireSubscription: false });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const [effective, usage] = await Promise.all([
    getEffectivePlan(session.teamId),
    getUsage(session.teamId),
  ]);

  const limits = getPlanLimits(effective.plan as PlanId);

  const meters = [
    { key: "orders", label: "Orders this month", used: usage.ordersThisMonth, limit: limits.ordersPerMonth },
    { key: "stores", label: "Connected stores", used: usage.stores, limit: limits.stores },
    { key: "adPlatforms", label: "Ad platforms", used: usage.adPlatforms, limit: limits.adPlatforms },
    { key: "teamMembers", label: "Team members", used: usage.teamMembers, limit: limits.teamMembers },
  ].map((m) => ({
    ...m,
    ratio: usageRatio(m.used, m.limit),
    warn: m.limit !== -1 && usageRatio(m.used, m.limit) >= 0.8,
    exhausted: m.limit !== -1 && m.used >= m.limit,
    unlimited: m.limit === -1,
  }));

  return NextResponse.json({
    plan: effective.plan,
    planSource: effective.source,
    usage,
    meters,
    upgradeUrl: "/pricing",
  });
}
