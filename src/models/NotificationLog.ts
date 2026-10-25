import mongoose, { Schema, Document, model, models } from "mongoose";
import type { OrderEvent } from "@/lib/whatsapp";

/**
 * Phase 9a: audit log for order notifications, and the dedup guard.
 * One "sent" row per (team, order, event, channel) — a redelivered
 * webhook or a second trigger source (Shopify webhook + courier
 * update) can never send the same message twice. The message body is
 * NOT stored here: the order already holds the customer contact, and
 * the log only needs to prove what was sent, when, and whether it
 * failed. Recipient is stored masked (last 4 digits / domain only).
 */
export interface INotificationLog extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  event: OrderEvent;
  channel: "whatsapp" | "email";
  recipientMasked: string;
  status: "sent" | "skipped" | "failed";
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    event: { type: String, required: true },
    channel: { type: String, enum: ["whatsapp", "email"], required: true },
    recipientMasked: { type: String, default: "" },
    status: { type: String, enum: ["sent", "skipped", "failed"], required: true },
    error: String,
  },
  { timestamps: true }
);

NotificationLogSchema.index({ teamId: 1, orderId: 1, event: 1, channel: 1 });

export default models.NotificationLog || model<INotificationLog>("NotificationLog", NotificationLogSchema);
