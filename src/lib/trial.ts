/**
 * Trial / account-archival helpers.
 *
 * Business rules
 * ─────────────
 * • New accounts get a 7-day free trial.
 * • An account is considered "active" when it has a paid subscription with
 *   status "active" | "trialing" | "past_due" (grace period).
 * • When the trial ends AND there is no active subscription, the account is
 *   "archived" — the dashboard is fully blocked and the pricing wall is shown.
 * • past_due subscriptions retain access (grace period — see hasActiveAccess).
 * • A scheduled_change to cancel or pause does NOT revoke access. Only when
 *   status itself becomes "cancelled" (and currentPeriodEnd has passed) do we
 *   archive.
 *
 * The canonical list of access-granting statuses lives in paddle.ts so that
 * this file and any future callers stay in sync automatically.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import { hasActiveAccess } from "@/lib/paddle";

export type AccountStatus =
  | "trialing"     // within the 7-day trial window
  | "active"       // paid subscription is active
  | "past_due"     // payment failed — short grace period before archival
  | "cancelled"    // cancelled but still within the billing period
  | "archived";    // trial expired with no paid plan → full wall shown

export type PlanLevel = "free" | "starter" | "growth" | "pro";

export interface TrialInfo {
  status: AccountStatus;
  plan: PlanLevel;
  trialEndsAt: Date | null;
  daysLeft: number;        // only meaningful when status === "trialing"
  isArchived: boolean;     // shortcut: status === "archived"
  paddleCustomerId?: string;
}

/**
 * Compute trial/account status for a team.
 * Reads from DB — call from server components / API routes only.
 */
export async function getAccountStatus(teamId: string): Promise<TrialInfo> {
  await connectDB();

  const teamOid = mongoose.Types.ObjectId.isValid(teamId)
    ? new mongoose.Types.ObjectId(teamId)
    : teamId;

  const [team, sub] = await Promise.all([
    TeamModel.findById(teamId).lean(),
    SubscriptionModel.findOne({
      $or: [{ teamId }, { teamId: teamOid }],
    })
      .sort({ updatedAt: -1 })
      .lean(),
  ]);

  const customerId = (sub?.customerId || team?.paddleCustomerId) as string | undefined;
  const now = new Date();

  // ── Paid subscription takes priority ─────────────────────────────────────
  if (sub) {
    const s = sub.status as string;
    const subPlan = (sub.plan as PlanLevel) || "free";

    // hasActiveAccess covers "active" | "trialing" | "past_due" — the shared
    // set in paddle.ts. Never duplicate this list here.
    if (hasActiveAccess(s)) {
      // Distinguish past_due from fully active so the UI can show a warning
      const status: AccountStatus = s === "past_due" ? "past_due" : "active";
      return {
        status,
        plan: subPlan,
        trialEndsAt: team?.trialEndsAt ?? null,
        daysLeft: 0,
        isArchived: false,
        paddleCustomerId: customerId,
      };
    }

    if (s === "cancelled") {
      // Cancelled — still has access until currentPeriodEnd (grace window)
      const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
      if (periodEnd && periodEnd > now) {
        return {
          status: "cancelled",
          plan: subPlan,
          trialEndsAt: team?.trialEndsAt ?? null,
          daysLeft: 0,
          isArchived: false,
          paddleCustomerId: customerId,
        };
      }
      // Period ended → archived
      return {
        status: "archived",
        plan: "free",
        trialEndsAt: team?.trialEndsAt ?? null,
        daysLeft: 0,
        isArchived: true,
        paddleCustomerId: customerId,
      };
    }

    // "paused" — access revoked immediately
    if (s === "paused") {
      return {
        status: "archived",
        plan: "free",
        trialEndsAt: team?.trialEndsAt ?? null,
        daysLeft: 0,
        isArchived: true,
        paddleCustomerId: customerId,
      };
    }
  }

  // ── Paid team plan takes priority if no sub or sub lookup is desynced ──────
  const teamPlan = (team?.plan as PlanLevel) || "free";
  if (teamPlan !== "free") {
    return {
      status: "active",
      plan: teamPlan,
      trialEndsAt: team?.trialEndsAt ?? null,
      daysLeft: 0,
      isArchived: false,
      paddleCustomerId: customerId,
    };
  }

  // ── No active subscription or paid plan — check trial ─────────────────────
  const trialEndsAt = team?.trialEndsAt ? new Date(team.trialEndsAt) : null;

  if (trialEndsAt && trialEndsAt > now) {
    const msLeft   = trialEndsAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return {
      status: "trialing",
      plan: "free",
      trialEndsAt,
      daysLeft,
      isArchived: false,
      paddleCustomerId: customerId,
    };
  }

  // Trial has expired and no paid subscription → archived
  return {
    status: "archived",
    plan: "free",
    trialEndsAt,
    daysLeft: 0,
    isArchived: true,
    paddleCustomerId: customerId,
  };
}

/**
 * Lightweight check — returns true when the account should be blocked.
 * Use in dashboard layout to decide whether to render the paywall.
 */
export function isAccountArchived(info: TrialInfo): boolean {
  return info.isArchived;
}
