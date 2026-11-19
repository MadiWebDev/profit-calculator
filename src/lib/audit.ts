import { connectDB } from "@/lib/db";
import AuditLogModel, { type AuditAction } from "@/models/AuditLog";
import mongoose from "mongoose";
import { logger } from "@/lib/logger";
import { resolveAdminTeamId, type requireSuperAdmin } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/rate-limit";

type AdminSession = Awaited<ReturnType<typeof requireSuperAdmin>>;

interface LogParams {
  teamId: mongoose.Types.ObjectId | string;
  userId: mongoose.Types.ObjectId | string;
  action: AuditAction;
  description: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(params: LogParams) {
  try {
    await connectDB();
    await AuditLogModel.create(params);
  } catch (err) {
    // Never let audit logging crash the main flow
    logger.error("Audit log failed", err);
  }
}

/**
 * Admin audit entry that never silently disappears. AuditLog.teamId is
 * required, and a team-less superAdmin has no team — the old call sites
 * skipped the entry entirely in that case, so a team-less admin's
 * campaign sends left no trace at all. This helper scopes the entry to
 * the admin's own user id when no team resolves (the scope is recorded
 * in metadata so the fallback is visible), and always captures the
 * request's IP + user agent, which no caller passed before.
 */
export async function logAdminAudit(opts: {
  req: Request;
  session: AdminSession;
  action: AuditAction;
  description: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (opts.session?.user as any)?.id as string | undefined;
  if (!adminId || !isValidObjectIdString(adminId)) return;
  const teamId = await resolveAdminTeamId(opts.session);
  const scope = teamId ?? new mongoose.Types.ObjectId(adminId);
  await logAudit({
    teamId: scope,
    userId: adminId,
    action: opts.action,
    description: opts.description,
    resourceType: opts.resourceType,
    resourceId: opts.resourceId,
    metadata: teamId
      ? opts.metadata
      : { ...opts.metadata, auditScope: "admin-user (no team)" },
    ipAddress: getClientIp(opts.req),
    userAgent: opts.req.headers.get("user-agent") ?? undefined,
  });
}

function isValidObjectIdString(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}
