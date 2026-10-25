/**
 * Security event logging + owner alerts (S5, R15).
 * Events store a TRUNCATED IP (last octet / last hextet removed) and never
 * a raw IP, email, or token — see docs/DATA_MAP.md. Critical events also
 * email the team owner via the existing email helper (best-effort, never
 * throws into the caller).
 */
import { connectDB } from "@/lib/db";
import SecurityEventModel, { type SecurityEventType } from "@/models/SecurityEvent";
import { logger } from "@/lib/logger";

export function truncateIp(ip?: string | null): string | undefined {
  if (!ip) return undefined;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 3).join(":") + ":*";
  }
  const parts = ip.split(".");
  if (parts.length === 4) return parts.slice(0, 3).join(".") + ".0";
  return undefined;
}

export function deviceFingerprint(userAgent?: string | null, ipTruncated?: string | null): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto");
  return createHash("sha256").update(`${userAgent ?? ""}|${ipTruncated ?? ""}`).digest("hex").slice(0, 32);
}

const CRITICAL: SecurityEventType[] = [
  "login_lockout",
  "two_factor_failed",
  "api_key_anomaly",
  "webhook_signature_failed",
  "mass_export",
  "data_deletion_requested",
  "impossible_travel_flag",
  "member_removed",
  "owner_transferred",
];

export async function recordSecurityEvent(input: {
  teamId?: string;
  userId?: string;
  type: SecurityEventType;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await connectDB();
    await SecurityEventModel.create({
      teamId: input.teamId,
      userId: input.userId,
      type: input.type,
      ipTruncated: truncateIp(input.ip),
      userAgent: input.userAgent?.slice(0, 300),
      metadata: input.metadata,
    });
    logger.info("security event", { type: input.type, teamId: input.teamId });
    if (CRITICAL.includes(input.type) && input.teamId) {
      // Best-effort owner alert — email helper is optional in this env.
      try {
        const { sendSecurityAlertEmail } = await import("@/lib/security-email");
        await sendSecurityAlertEmail(input.teamId, input.type, input.metadata);
      } catch {
        // Alert failure must not break the request that logged the event.
      }
    }
  } catch (err) {
    logger.warn("security event log failed", { type: input.type, error: String(err) });
  }
}

/** Impossible-travel heuristic (S1.3): two logins, far apart, too fast. */
export function isImpossibleTravel(
  prev: { country?: string; at: Date } | null,
  next: { country?: string; at: Date },
): boolean {
  if (!prev?.country || !next.country || prev.country === next.country) return false;
  const hours = (next.at.getTime() - prev.at.getTime()) / 3_600_000;
  // Different country within 1 hour is flagged (no flight could do it).
  // Country resolution itself is approximate (from IP geolocation headers);
  // this is a flag for review, never an automatic lockout.
  return hours < 1 && hours >= 0;
}
