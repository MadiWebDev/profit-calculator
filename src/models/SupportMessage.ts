import mongoose, { Schema, Document, model, models } from "mongoose";
import type { SupportTopic } from "@/lib/support";

/**
 * SupportMessage — a submission from the Help Center contact form
 * (/help/contact → POST /api/support/contact). Public form: no team is
 * required, and the sender may be logged out, so userId is optional.
 * No IP address is stored; only the (truncated) user agent, for spam triage.
 */
export interface ISupportMessage extends Document {
  name: string;
  email: string;
  topic: SupportTopic;
  message: string;
  userId?: mongoose.Types.ObjectId;
  userAgent?: string;
  status: "new" | "replied" | "closed";
  emailSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SupportMessageSchema = new Schema<ISupportMessage>(
  {
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, maxlength: 254, index: true },
    topic: {
      type: String,
      enum: ["billing", "connect-store", "ad-accounts", "bug", "feature-request", "other"],
      required: true,
    },
    message: { type: String, required: true, maxlength: 5000 },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    userAgent: { type: String, maxlength: 256 },
    status: { type: String, enum: ["new", "replied", "closed"], default: "new", index: true },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

SupportMessageSchema.index({ createdAt: -1 });

export default models.SupportMessage || model<ISupportMessage>("SupportMessage", SupportMessageSchema);
