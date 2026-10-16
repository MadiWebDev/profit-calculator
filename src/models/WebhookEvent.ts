import mongoose, { Schema, Document, model, models } from "mongoose";

export type WebhookEventStatus = "received" | "processed" | "skipped" | "failed";

export interface IWebhookEvent extends Document {
  _id: mongoose.Types.ObjectId;
  /** Provider's event id (Paddle `event_id`) — unique, used for dedup. */
  eventId: string;
  source: "paddle";
  eventType: string;
  occurredAt?: Date;
  status: WebhookEventStatus;
  /** Short error summary when status is failed. */
  error?: string;
  /** Skip reason when status is skipped (duplicate / stale). */
  skipReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId:    { type: String, required: true, unique: true },
    source:     { type: String, enum: ["paddle"], required: true, default: "paddle" },
    eventType:  { type: String, required: true, index: true },
    occurredAt: Date,
    status: {
      type: String,
      enum: ["received", "processed", "skipped", "failed"],
      default: "received",
      index: true,
    },
    error:      { type: String, maxlength: 2000 },
    skipReason: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);

// Recent events first
WebhookEventSchema.index({ createdAt: -1 });
// TTL: keep 180 days of webhook history for debugging/audit
WebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export const WebhookEventModel =
  (models.WebhookEvent as mongoose.Model<IWebhookEvent> | undefined) ??
  model<IWebhookEvent>("WebhookEvent", WebhookEventSchema);
