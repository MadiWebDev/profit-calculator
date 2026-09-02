import mongoose, { Schema, Document, model, models } from "mongoose";

export type NotificationType =
  | "goal_behind"
  | "margin_drop"
  | "ad_spend_high"
  | "sync_error"
  | "sync_complete"
  | "trial_ending"
  | "subscription_cancelled"
  | "team_invite"
  | "refund_spike"
  | "cogs_missing";

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId; // null = team-wide
  type: NotificationType;
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | "success";
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  sentVia: ("in_app" | "email" | "slack")[];
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    teamId:      { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    userId:      { type: Schema.Types.ObjectId, ref: "User" },
    type:        { type: String, required: true },
    title:       { type: String, required: true },
    body:        { type: String, required: true },
    severity:    { type: String, enum: ["info", "warning", "error", "success"], default: "info" },
    read:        { type: Boolean, default: false, index: true },
    actionUrl:   String,
    actionLabel: String,
    metadata:    Schema.Types.Mixed,
    sentVia:     [{ type: String, enum: ["in_app", "email", "slack"] }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ teamId: 1, read: 1, createdAt: -1 });
// Auto-delete after 90 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default models.Notification || model<INotification>("Notification", NotificationSchema);
