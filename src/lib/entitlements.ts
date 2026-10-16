/**
 * Plan entitlements — the single enforcement point for plan limits.
 *
 * getEffectivePlan(teamId):
 *   - subscription active/trialing            → subscription plan
 *   - past_due within 7-day grace             → subscription plan (grace)
 *   - past_due beyond grace / paused          → free
 *   - cancelled but currentPeriodEnd in future→ subscription plan (until period end)
 *   - cancelled and period ended              → free
 *   - no subscription + trial active          → growth limits (trial = full product)
 *   - no subscription + trial expired         → free
 *
 * getUsage(teamId): current-month orders, stores, ad platforms, team members,
 *   AI insights used this month.
 *
 * assertCan(teamId, action, { count }): throws EntitlementError
 *   { code: "PLAN_LIMIT", limit, used, upgradeTo } → map to HTTP 402.
 *
 * Limit of -1 means unlimited.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import TeamModel from "@/models/Team";
import SubscriptionModel from "@/models/Subscription";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import AdAccountModel from "@/models/AdAccount";
import { getPlanLimits, type PlanId, type PlanLimits } from "@/lib/plans";
import { logger } from "@/lib/logger";

export type EntitlementAction =
  | "orders.import"      // importing/syncing orders (monthly cap)
  | "stores.connect"     // connecting a new store
  | "adplatforms.connect"// connecting a new ad platform
  | "team.invite"        // inviting a team member
  | "ai.insights"        // generating AI insights
  | "api.access";        // using the public API v1

export interface EntitlementErrorDetails {
  code: "PLAN_LIMIT";
  action: EntitlementAction;
  limit: number;
  used: number;
  upgradeTo: PlanId | null;
  message: string;
}

export class EntitlementError extends Error {
  details: EntitlementErrorDetails;
  constructor(details: EntitlementErrorDetails) {
    super(details.message);
    this.name = "EntitlementError";
    this.details = details;
  }
}

export interface EffectivePlan {
  plan: PlanId;
  source: "subscription" | "trial" | "grace" | "free";
  limits: PlanLimits;
}

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolve the team's effective plan, honouring subscription lifecycle states.
 */
export async function getEffectivePlan(teamId: string): Promise<EffectivePlan> {
  await connectDB();
  const teamOid = new mongoose.Types.ObjectId(teamId);

  const [team, sub] = await Promise.all([
    TeamModel.findById(teamOid).select("plan trialEndsAt").lean(),
    SubscriptionModel.findOne({ teamId: teamOid }).lean(),
  ]);

  const free: EffectivePlan = { plan: "free", source: "free", limits: getPlanLimits("free") };
  const now = new Date();

  if (sub) {
    const status = sub.status as string;
    const plan = (sub.plan ?? "free") as PlanId;

    if (status === "active" || status === "trialing") {
      return { plan, source: "subscription", limits: getPlanLimits(plan) };
    }

    if (status === "past_due") {
      // 7-day grace from when the status last changed (updatedAt proxy)
      const changedAt = sub.updatedAt ? new Date(sub.updatedAt) : now;
      if (now.getTime() - changedAt.getTime() <= PAST_DUE_GRACE_MS) {
        return { plan, source: "grace", limits: getPlanLimits(plan) };
      }
      logger.info("entitlements: past_due grace expired", { teamId });
      return free;
    }

    if (status === "cancelled") {
      // Access until the end of the paid period
      const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
      if (periodEnd && periodEnd > now) {
        return { plan, source: "subscription", limits: getPlanLimits(plan) };
      }
      return free;
    }

    // paused or unknown → free
    return free;
  }

  // No subscription — check the 7-day trial
  const trialEndsAt = team?.trialEndsAt ? new Date(team.trialEndsAt) : null;
  if (trialEndsAt && trialEndsAt > now) {
    // Assumption: trial users get the full product (growth-level limits)
    // so they can evaluate every feature before paying.
    return { plan: "growth", source: "trial", limits: getPlanLimits("growth") };
  }

  return free;
}

export interface TeamUsage {
  ordersThisMonth: number;
  stores: number;
  adPlatforms: number;
  teamMembers: number;
  aiInsightsThisMonth: number;
}

function startOfMonth(d = new Date()): Date {
  const s = new Date(d);
  s.setDate(1);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** Current usage counters for a team. */
export async function getUsage(teamId: string): Promise<TeamUsage> {
  await connectDB();
  const teamOid = new mongoose.Types.ObjectId(teamId);
  const monthStart = startOfMonth();

  const [ordersThisMonth, stores, adPlatforms, team] = await Promise.all([
    OrderModel.countDocuments({ teamId: teamOid, orderDate: { $gte: monthStart } }),
    StoreModel.countDocuments({ teamId: teamOid, isActive: true }),
    AdAccountModel.countDocuments({ teamId: teamOid, isActive: true }),
    TeamModel.findById(teamOid).select("members").lean(),
  ]);

  const members = team?.members ?? [];
  const teamMembers = members.filter(
    (m: { status?: string }) => m.status === "active"
  ).length;

  // AI insights usage is tracked in the Insight collection (Phase 9); 0 until then
  let aiInsightsThisMonth = 0;
  try {
    const { default: InsightModel } = await import("@/models/Insight");
    aiInsightsThisMonth = await InsightModel.countDocuments({
      teamId: teamOid,
      createdAt: { $gte: monthStart },
    });
  } catch {
    aiInsightsThisMonth = 0; // model not yet created — Phase 9
  }

  return { ordersThisMonth, stores, adPlatforms, teamMembers, aiInsightsThisMonth };
}

const ACTION_LIMIT_KEY: Record<EntitlementAction, keyof PlanLimits> = {
  "orders.import": "ordersPerMonth",
  "stores.connect": "stores",
  "adplatforms.connect": "adPlatforms",
  "team.invite": "teamMembers",
  "ai.insights": "aiInsights",
  "api.access": "apiAccess",
};

const ACTION_LABEL: Record<EntitlementAction, string> = {
  "orders.import": "monthly orders",
  "stores.connect": "connected stores",
  "adplatforms.connect": "ad platforms",
  "team.invite": "team members",
  "ai.insights": "AI insights",
  "api.access": "API access",
};

/** Smallest plan whose limit for `key` exceeds `limit` (or is unlimited). */
function suggestUpgrade(key: keyof PlanLimits, limit: number): PlanId | null {
  const order: PlanId[] = ["free", "starter", "growth", "pro"];
  for (const plan of order) {
    const v = getPlanLimits(plan)[key];
    if (typeof v === "number" && (v === -1 || v > limit)) return plan;
  }
  return null;
}

/**
 * Assert that a team may perform `action`.
 * @param count how many units the action would add (default 1)
 * @throws EntitlementError when the plan limit is reached
 */
export async function assertCan(
  teamId: string,
  action: EntitlementAction,
  opts: { count?: number } = {}
): Promise<EffectivePlan> {
  const count = opts.count ?? 1;
  const effective = await getEffectivePlan(teamId);
  const key = ACTION_LIMIT_KEY[action];
  const rawLimit = effective.limits[key];

  // Boolean gates (aiInsights, apiAccess, csvImport, pdfReports)
  if (typeof rawLimit === "boolean") {
    if (!rawLimit) {
      throw new EntitlementError({
        code: "PLAN_LIMIT",
        action,
        limit: 0,
        used: 1,
        upgradeTo: suggestUpgrade(key, 0),
        message: `${ACTION_LABEL[action]} is not available on your plan.`,
      });
    }
    return effective;
  }

  const limit = rawLimit as number;
  if (limit === -1) return effective; // unlimited

  const usage = await getUsage(teamId);
  const used =
    action === "orders.import" ? usage.ordersThisMonth
    : action === "stores.connect" ? usage.stores
    : action === "adplatforms.connect" ? usage.adPlatforms
    : action === "team.invite" ? usage.teamMembers
    : action === "ai.insights" ? usage.aiInsightsThisMonth
    : 0;

  if (used + count > limit) {
    throw new EntitlementError({
      code: "PLAN_LIMIT",
      action,
      limit,
      used,
      upgradeTo: suggestUpgrade(key, limit),
      message: `You've reached your plan's limit of ${limit} ${ACTION_LABEL[action]} (${used} used).`,
    });
  }
  return effective;
}

/** Convert an EntitlementError to a 402 JSON response shape. */
export function entitlementResponse(err: EntitlementError) {
  const d = err.details;
  return {
    status: 402 as const,
    body: {
      error: d.message,
      code: d.code,
      action: d.action,
      limit: d.limit,
      used: d.used,
      upgradeTo: d.upgradeTo,
      upgradeUrl: "/pricing",
    },
  };
}

/** True when `used` is at or above `pct` of `limit` (for usage meters). */
export function usageRatio(used: number, limit: number): number {
  if (limit === -1) return 0;
  if (limit <= 0) return used > 0 ? 1 : 0;
  return Math.min(1, used / limit);
}

import { NextResponse } from "next/server";

/**
 * Route-level entitlement check. Returns a 402 NextResponse when the plan
 * limit is hit, or null when the action is allowed. Also returns the
 * effective plan so routes can use limits (e.g. orderCap for syncs).
 */
export async function checkEntitlement(
  teamId: string,
  action: EntitlementAction,
  opts: { count?: number } = {}
): Promise<{ response: NextResponse } | { effective: EffectivePlan }> {
  try {
    const effective = await assertCan(teamId, action, opts);
    return { effective };
  } catch (e) {
    if (e instanceof EntitlementError) {
      const r = entitlementResponse(e);
      return { response: NextResponse.json(r.body, { status: r.status }) };
    }
    throw e;
  }
}
