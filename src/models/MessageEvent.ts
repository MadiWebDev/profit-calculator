import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * MessageEvent — one append-only delivery event for one campaign message,
 * as reported by a provider webhook (Phase 2) or recorded at send time.
 *
 * Why append-only: provider events can arrive out of order and more than
 * once. The event log never rewrites history — the recipient's CURRENT
 * status is derived from the latest valid event (see
 * isValidMessageEventTransition in src/lib/message-events.ts). Dropping
 * or overwriting an event would destroy the evidence a delivery dispute
 * needs.
 *
 * Correlation: providerMessageId is the id the provider assigned at send
 * time (Resend `id`, Meta `wamid`) and is stored on the campaign
 * recipient record (Campaign.recipients[].providerMessageId). A webhook
 * event that cannot be correlated to a stored provider id is still
 * recorded (with providerMessageId null) so the gap is visible, never
 * silently dropped.
 *
 * Idempotency: providerEventId is the provider's own event id (Resend
 * webhook event id, Meta status id + status + timestamp composite).
 * The unique index makes a re-delivered webhook a no-op — record a
 * second copy and the insert fails with a duplicate-key error, which
 * recordMessageEvent() treats as "already seen".
 */
export type MessageEventType =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "read"
  | "suppressed";

export type MessageEventProvider = "resend" | "whatsapp";

export interface IMessageEvent extends Document {
  campaignId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  /** Email address (email channel) or phone number (WhatsApp channel). */
  identifier: string;
  channel: "email" | "whatsapp";
  provider: MessageEventProvider;
  /** Provider-assigned message id (Resend id / Meta wamid), when known. */
  providerMessageId?: string;
  /** Provider's own event id — the idempotency key. */
  providerEventId?: string;
  eventType: MessageEventType;
  /** When the provider says the event happened (falls back to receipt). */
  occurredAt: Date;
  /** Raw provider payload, trimmed to the event fields. Never logged. */
  eventData?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MessageEventSchema = new Schema<IMessageEvent>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    identifier: { type: String, required: true, maxlength: 254 },
    channel: { type: String, enum: ["email", "whatsapp"], required: true },
    provider: { type: String, enum: ["resend", "whatsapp"], required: true },
    providerMessageId: { type: String, maxlength: 128 },
    providerEventId: { type: String, maxlength: 256 },
    eventType: {
      type: String,
      enum: ["sent", "delivered", "opened", "clicked", "bounced", "complained", "failed", "read", "suppressed"],
      required: true,
    },
    occurredAt: { type: Date, required: true },
    eventData: Schema.Types.Mixed,
  },
  { timestamps: true }
);

MessageEventSchema.index({ campaignId: 1, createdAt: -1 });
MessageEventSchema.index({ providerMessageId: 1, occurredAt: 1 });
MessageEventSchema.index({ providerEventId: 1 }, { unique: true, sparse: true });

export default models.MessageEvent || model<IMessageEvent>("MessageEvent", MessageEventSchema);
