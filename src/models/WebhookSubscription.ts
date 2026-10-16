import mongoose, { Schema, Document, model, models } from "mongoose";

export const OUTBOUND_WEBHOOK_EVENTS = [
  "anomaly.detected",
  "goal.alert",
  "subscription.updated",
  "sync.completed",
] as const;

export type OutboundWebhookEvent = (typeof OUTBOUND_WEBHOOK_EVENTS)[number];

export interface IWebhookSubscription extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  url: string;
  /** HMAC-SHA256 signing secret (stored encrypted at the API layer). */
  secret: string;
  events: OutboundWebhookEvent[];
  active: boolean;
  lastDeliveredAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSubscriptionSchema = new Schema<IWebhookSubscription>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    url:    { type: String, required: true, maxlength: 2000 },
    secret: { type: String, required: true },
    events: [{ type: String, enum: OUTBOUND_WEBHOOK_EVENTS }],
    active: { type: Boolean, default: true, index: true },
    lastDeliveredAt: Date,
    lastError: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

WebhookSubscriptionSchema.index({ teamId: 1, active: 1 });

export const WebhookSubscriptionModel =
  (models.WebhookSubscription as mongoose.Model<IWebhookSubscription> | undefined) ??
  model<IWebhookSubscription>("WebhookSubscription", WebhookSubscriptionSchema);
