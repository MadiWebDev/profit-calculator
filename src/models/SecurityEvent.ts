import mongoose, { Schema, Document, model, models } from "mongoose";

export type SecurityEventType =
  | "login_success"
  | "login_failure"
  | "login_lockout"
  | "two_factor_enabled"
  | "two_factor_disabled"
  | "two_factor_failed"
  | "recovery_code_used"
  | "session_revoked"
  | "sessions_revoked_all"
  | "password_changed"
  | "api_key_created"
  | "api_key_revoked"
  | "api_key_anomaly"
  | "permission_denied"
  | "webhook_signature_failed"
  | "token_refresh_failed"
  | "mass_export"
  | "data_export_requested"
  | "data_deletion_requested"
  | "data_deletion_completed"
  | "new_device_login"
  | "impossible_travel_flag"
  | "invite_created"
  | "invite_accepted"
  | "member_removed"
  | "owner_transferred"
  | "gdpr_request";

export interface ISecurityEvent extends Document {
  teamId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  type: SecurityEventType;
  /** Hashed IP (SHA-256 of ip + salt-free? no — store truncated IP only, see DATA_MAP) */
  ipTruncated?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const SecurityEventSchema = new Schema<ISecurityEvent>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    type: { type: String, required: true, index: true },
    ipTruncated: String,
    userAgent: { type: String, maxlength: 300 },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Retention: security events age out after 365 days (index TTL).
SecurityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });
SecurityEventSchema.index({ teamId: 1, createdAt: -1 });

export default models.SecurityEvent || model<ISecurityEvent>("SecurityEvent", SecurityEventSchema);
