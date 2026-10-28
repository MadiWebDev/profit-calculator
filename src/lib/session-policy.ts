/**
 * Session policy — pure helpers, edge-safe (no Node.js imports).
 *
 * Two limits, both enforced in the auth jwt() callback:
 *  - Absolute lifetime: 30 days from token issue (iat), regardless of
 *    activity. NextAuth's updateAge refreshes tokens on activity, so
 *    without this cap a daily-active session would never expire.
 *  - Idle timeout: 7 days without any authenticated request. Activity is
 *    recorded in User.lastSeenAt by the jwt() check (at most once per
 *    5 minutes per session, same bound as the password-change check).
 *
 * Also hosts the two-factor-enforcement decision so it is testable:
 * a team may require 2FA for its owner/admin members.
 */

export const SESSION_ABSOLUTE_MAX_AGE_SEC = 30 * 24 * 60 * 60;
export const SESSION_IDLE_TIMEOUT_SEC = 7 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SEC = 24 * 60 * 60;

export function isSessionExpired(args: {
  /** Token issue time, seconds since epoch (JWT iat). */
  iatSec?: number | null;
  /** Last authenticated activity, milliseconds since epoch (User.lastSeenAt). */
  lastSeenMs?: number | null;
  nowMs?: number;
}): boolean {
  const nowMs = args.nowMs ?? Date.now();
  if (typeof args.iatSec === "number") {
    if (nowMs / 1000 - args.iatSec > SESSION_ABSOLUTE_MAX_AGE_SEC) return true;
  }
  if (typeof args.lastSeenMs === "number") {
    if (nowMs - args.lastSeenMs > SESSION_IDLE_TIMEOUT_SEC * 1000) return true;
  }
  return false;
}

/** True when this member must enrol in 2FA before using the dashboard. */
export function requiresTwoFactorSetup(args: {
  twoFactorRequiredForAdmins?: boolean;
  teamRole?: string | null;
  twoFactorEnabled?: boolean;
}): boolean {
  if (!args.twoFactorRequiredForAdmins) return false;
  if (args.twoFactorEnabled) return false;
  return args.teamRole === "owner" || args.teamRole === "admin";
}
