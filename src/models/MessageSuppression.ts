import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * MessageSuppression — one address that must never receive campaign
 * messages on a channel again. The send route (Phase 5) checks this
 * collection before sending; a suppressed identifier is recorded as
 * "skipped" with the reason, never sent, and there is no admin
 * override — removal is a deliberate, audited act (see unsuppress in
 * src/lib/suppression.ts), not a send-time bypass.
 *
 * identifier is normalized at write time (email lowercased + trimmed;
 * phone trimmed) so "A@x.com" and "a@x.com" are the same suppression.
 * channel "all" suppresses both email and WhatsApp for the identifier.
 * One row per (identifier, channel) — the unique index makes a second
 * suppress for the same pair an update, never a duplicate.
 *
 * Phase 1 records suppressions and the helpers to check them. Send-time
 * enforcement lands in Phase 5, so no recipient is silently excluded
 * before the enforcement + UI exist to explain it.
 */
export type SuppressionReason =
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "manual"
  | "invalid";

export type SuppressionSource =
  | "unsubscribe_link"
  | "reply"
  | "webhook"
  | "admin"
  | "bounce";

export type SuppressionChannel = "email" | "whatsapp" | "all";

export interface IMessageSuppression extends Document {
  identifier: string;
  channel: SuppressionChannel;
  reason: SuppressionReason;
  source: SuppressionSource;
  /** Campaign the suppression came from, when it came from one. */
  campaignId?: mongoose.Types.ObjectId;
  /** Admin who added it manually, when it was manual. */
  createdBy?: mongoose.Types.ObjectId;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSuppressionSchema = new Schema<IMessageSuppression>(
  {
    identifier: { type: String, required: true, trim: true, maxlength: 254 },
    channel: { type: String, enum: ["email", "whatsapp", "all"], required: true },
    reason: {
      type: String,
      enum: ["unsubscribed", "bounced", "complained", "manual", "invalid"],
      required: true,
    },
    source: {
      type: String,
      enum: ["unsubscribe_link", "reply", "webhook", "admin", "bounce"],
      required: true,
    },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

MessageSuppressionSchema.index({ identifier: 1, channel: 1 }, { unique: true });
MessageSuppressionSchema.index({ createdAt: -1 });

export default models.MessageSuppression ||
  model<IMessageSuppression>("MessageSuppression", MessageSuppressionSchema);
