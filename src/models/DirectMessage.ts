import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * DirectMessage — one message sent to one user from the Campaign Center
 * user directory, WITHOUT a campaign. The admin clicks Message on a
 * user, picks Email or WhatsApp in the dialog, and sends — no draft, no
 * campaign record, no effect on campaign KPIs or stats.
 *
 * What is stored: who it went to (userId + a denormalized identifier and
 * name snapshot, so the log survives a user being deleted), which
 * channel, the content (email: subject + typed body; WhatsApp: the
 * Meta-approved template name — the template's own text is what Meta
 * sends, {{1}} is the recipient's first name), the outcome (sent with
 * the provider message id, or failed with the provider's exact error),
 * and who sent it. A send that is refused before any provider call
 * (suppressed, unsubscribed, no phone, invalid template, missing
 * credentials) creates NO record — the admin sees the refusal in the
 * dialog immediately. A provider rejection DOES create a failed record,
 * so there is a trail.
 *
 * Delivery tracking for a direct message is the same webhook path as
 * campaigns: the provider message id is stored, so a later Resend /
 * Meta event for it lands in the MessageEvent log. Direct messages
 * never appear in campaign stats — the stats aggregations read
 * Campaign documents only.
 */
export type DirectMessageChannel = "email" | "whatsapp";
export type DirectMessageStatus = "sent" | "failed";

export interface IDirectMessage extends Document {
  userId: mongoose.Types.ObjectId;
  /** Denormalized at send time: the email address or phone used. */
  identifier: string;
  /** Denormalized at send time: the recipient's display name. */
  userName: string;
  channel: DirectMessageChannel;
  /** Email subject (empty string for WhatsApp). */
  subject: string;
  /** Email: the typed body. WhatsApp: the template name is in
   * whatsappTemplateName and body is empty. */
  body: string;
  /** WhatsApp only: the Meta-approved template name that was sent. */
  whatsappTemplateName?: string;
  status: DirectMessageStatus;
  /** Resend id / Meta wamid when the provider accepted the message. */
  providerMessageId?: string;
  /** Provider error text when the send failed (max 500 chars). */
  error?: string;
  /** When the provider accepted the message; absent when failed. */
  sentAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DirectMessageSchema = new Schema<IDirectMessage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    identifier: { type: String, required: true, trim: true, maxlength: 254 },
    userName: { type: String, required: true, trim: true, maxlength: 200 },
    channel: { type: String, enum: ["email", "whatsapp"], required: true },
    subject: { type: String, default: "", trim: true, maxlength: 200 },
    body: { type: String, default: "", trim: true, maxlength: 5000 },
    whatsappTemplateName: { type: String, trim: true, maxlength: 512 },
    status: { type: String, enum: ["sent", "failed"], required: true },
    providerMessageId: { type: String, trim: true, maxlength: 128 },
    error: { type: String, trim: true, maxlength: 500 },
    sentAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

DirectMessageSchema.index({ userId: 1, createdAt: -1 });
DirectMessageSchema.index({ createdAt: -1 });

const DirectMessageModel =
  (models.DirectMessage as mongoose.Model<IDirectMessage>) ||
  model<IDirectMessage>("DirectMessage", DirectMessageSchema);

export default DirectMessageModel;
