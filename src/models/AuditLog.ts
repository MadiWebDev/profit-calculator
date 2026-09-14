import mongoose, { Schema, Document, model, models } from "mongoose";

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.invited"
  | "user.role_changed"
  | "user.removed"
  | "store.connected"
  | "store.disconnected"
  | "product.created"
  | "product.cogs_updated"
  | "product.updated"
  | "product.deleted"
  | "order.imported"
  | "order.created"
  | "order.updated"
  | "order.deleted"
  | "subscription.created"
  | "subscription.cancelled"
  | "subscription.upgraded"
  | "goal.created"
  | "goal.updated"
  | "report.exported"
  | "settings.updated"
  | "api_key.created"
  | "api_key.revoked";

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    resourceType: String,
    resourceId: String,
    description: { type: String, required: true },
    metadata: Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AuditLogSchema.index({ teamId: 1, createdAt: -1 });
AuditLogSchema.index({ teamId: 1, action: 1 });

// Auto-expire logs after 1 year
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export default models.AuditLog || model<IAuditLog>("AuditLog", AuditLogSchema);
