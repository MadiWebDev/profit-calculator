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
 * • past_due subscriptions get a 3-day grace period before archival.
 */

import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";

export type AccountStatus =
  | "trialing"     // within the 7-day trial window
  | "active"       // paid subscription is active
  | "past_due"     // payment failed — short grace period before archival
  | "cancelled"    // cancelled but still within the billing period
  | "archived";    // trial expired with no paid plan → full wall shown

export interface TrialInfo {
  status: AccountStatus;
  trialEndsAt: Date | null;
  daysLeft: number;        // only meaningful when status === "trialing"
  isArchived: boolean;     // shortcut: status === "archived"
}

/**
 * Compute trial/account status for a team.
 * Reads from DB — call from server components / API routes only.
 */
export async function getAccountStatus(teamId: string): Promise<TrialInfo> {
  await connectDB();

  const team = await TeamModel.findById(teamId).lean();

  // Fetch latest subscription for this team
  const sub = await SubscriptionModel.findOne({ teamId }).lean();

  const now = new Date();

  // ── Paid subscription takes priority ─────────────────────────────────────
  if (sub) {
    const s = sub.status as string;
    if (s === "active" || s === "trialing") {
      return {
        status: "active",
        trialEndsAt: team?.trialEndsAt ?? null,
        daysLeft: 0,
        isArchived: false,
      };
    }
    if (s === "past_due") {
      return {
        status: "past_due",
        trialEndsAt: team?.trialEndsAt ?? null,
        daysLeft: 0,
        isArchived: false,
      };
    }
    if (s === "cancelled") {
      // Cancelled — still has access until currentPeriodEnd
      const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
      if (periodEnd && periodEnd > now) {
        return {
          status: "cancelled",
          trialEndsAt: team?.trialEndsAt ?? null,
          daysLeft: 0,
          isArchived: false,
        };
      }
      // Period ended → archived
      return {
        status: "archived",
        trialEndsAt: team?.trialEndsAt ?? null,
        daysLeft: 0,
        isArchived: true,
      };
    }
  }

  // ── No active subscription — check trial ──────────────────────────────────
  const trialEndsAt = team?.trialEndsAt ? new Date(team.trialEndsAt) : null;

  if (trialEndsAt && trialEndsAt > now) {
    const msLeft = trialEndsAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return {
      status: "trialing",
      trialEndsAt,
      daysLeft,
      isArchived: false,
    };
  }

  // Trial has expired and no paid subscription → archived
  return {
    status: "archived",
    trialEndsAt,
    daysLeft: 0,
    isArchived: true,
  };
}

/**
 * Lightweight check — returns true when the account should be blocked.
 * Use in dashboard layout to decide whether to render the paywall.
 */
export function isAccountArchived(info: TrialInfo): boolean {
  return info.isArchived;
}
