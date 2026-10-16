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
 * • A scheduled_change to cancel or pause does NOT revoke access.  Only when
 *   status itself becomes "cancelled" (and currentPeriodEnd has passed) do we
 *   archive.
 *
 * The canonical list of access-granting statuses lives in paddle.ts so that
 * this file and any future callers stay in sync automatically.
 */

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

  const [team, sub] = await Promise.all([
    TeamModel.findById(teamId).lean(),
    SubscriptionModel.findOne({ teamId }).lean(),
  ]);

  const now = new Date();

  // ── Paid subscription takes priority ─────────────────────────────────────
  if (sub) {
    const s = sub.status as string;

    // hasActiveAccess covers "active" | "trialing" | "past_due" — the shared
    // set in paddle.ts.  Never duplicate this list here.
    if (hasActiveAccess(s)) {
      // Distinguish past_due from fully active so the UI can show a warning
      const status: AccountStatus = s === "past_due" ? "past_due" : "active";
      return {
        status,
        trialEndsAt: team?.trialEndsAt ?? null,
        daysLeft: 0,
        isArchived: false,
      };
    }

    if (s === "cancelled") {
      // Cancelled — still has access until currentPeriodEnd (grace window)
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

    // "paused" — access revoked immediately
    if (s === "paused") {
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
    const msLeft   = trialEndsAt.getTime() - now.getTime();
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
