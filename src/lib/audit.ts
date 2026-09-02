import { connectDB } from "@/lib/db";
import AuditLogModel, { type AuditAction } from "@/models/AuditLog";
import type mongoose from "mongoose";

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
    console.error("Audit log failed:", err);
  }
}
