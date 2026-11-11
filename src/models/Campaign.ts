import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Campaign — a superAdmin-authored bulk message to users, sent by email
 * (Resend) or WhatsApp (Meta WhatsApp Cloud API, template message).
 *
 * Lifecycle: draft → sending → sent (or failed when the send could not
 * start at all, e.g. provider credentials missing). A campaign is sent
 * at most once: only drafts can be sent, and the send route flips the
 * status to "sending" before any message goes out, so a double-click or
 * a retried request cannot re-blast the audience.
 *
 * Per-recipient outcomes are stored on the campaign itself so the admin
 * can see exactly who got the message, who failed (with the provider's
 * error text), and who was skipped (no phone number on file for
 * WhatsApp, or an invalid one). Recipient identifiers are stored
 * unmasked — this collection is superAdmin-only.
 *
 * Audience cap: at most CAMPAIGN_AUDIENCE_CAP recipients per send
 * (see src/lib/campaigns.ts). Anything above the cap is never sent.
 * No scheduling in v1 — a send happens immediately when the admin
 * confirms it.
 */
export type CampaignChannel = "email" | "whatsapp";

export type CampaignTemplateType =
  | "announcement"
  | "product_update"
  | "trial_ending"
  | "billing_notice"
  | "feature_launch";

export type CampaignAudienceType = "all" | "plan" | "team" | "users" | "limited";

export type CampaignStatus = "draft" | "sending" | "sent" | "failed";

export type CampaignRecipientStatus = "sent" | "failed" | "skipped";

export interface ICampaignRecipient {
  userId?: mongoose.Types.ObjectId;
  /** Email address (email channel) or phone number (WhatsApp channel). */
  identifier: string;
  status: CampaignRecipientStatus;
  /** Provider error text for "failed", or the skip reason for "skipped". */
  error?: string;
  sentAt?: Date;
}

export interface ICampaign extends Document {
  name: string;
  channel: CampaignChannel;
  templateType: CampaignTemplateType;
  /** Email subject. Optional — each template type has a default subject. */
  subject?: string;
  /** Message body. {{name}} is replaced with the recipient's first name. */
  body: string;
  /**
   * WhatsApp only: the Meta-approved template NAME, typed in by the
   * admin. Never hardcoded — the template must be created and approved
   * in Meta Business Manager first. Validated as a Meta template name
   * (lowercase letters, digits, underscores).
   */
  whatsappTemplateName?: string;
  audienceType: CampaignAudienceType;
  audiencePlan?: "free" | "starter" | "growth" | "pro";
  audienceTeamId?: mongoose.Types.ObjectId;
  /**
   * "users" only: the specific users targeted. De-duplicated and
   * validated against the DB at create time; re-checked at send time —
   * a user deleted between create and send is recorded as a skipped
   * recipient, never silently dropped. Capped at 500.
   */
  audienceUserIds?: mongoose.Types.ObjectId[];
  /**
   * "limited" only: how many of the oldest users (by createdAt) to
   * target. Admin-picked 1–500, default 25. Enforced server-side at
   * create and clamped again at send time.
   */
  audienceLimit?: number;
  status: CampaignStatus;
  createdBy: mongoose.Types.ObjectId;
  /** Totals from the last send attempt (0 while a draft). */
  stats: {
    targeted: number;
    sent: number;
    failed: number;
    skipped: number;
  };
  /** Top-level send failure (e.g. provider not configured at send time). */
  error?: string;
  recipients: ICampaignRecipient[];
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignRecipientSchema = new Schema<ICampaignRecipient>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    identifier: { type: String, required: true, maxlength: 254 },
    status: {
      type: String,
      enum: ["sent", "failed", "skipped"],
      required: true,
    },
    error: { type: String, maxlength: 500 },
    sentAt: Date,
  },
  { _id: false }
);

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    channel: { type: String, enum: ["email", "whatsapp"], required: true },
    templateType: {
      type: String,
      enum: ["announcement", "product_update", "trial_ending", "billing_notice", "feature_launch"],
      required: true,
    },
    subject: { type: String, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    whatsappTemplateName: { type: String, trim: true, maxlength: 512 },
    audienceType: { type: String, enum: ["all", "plan", "team", "users", "limited"], required: true, default: "all" },
    audiencePlan: { type: String, enum: ["free", "starter", "growth", "pro"] },
    audienceTeamId: { type: Schema.Types.ObjectId, ref: "Team" },
    audienceUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    audienceLimit: { type: Number, min: 1, max: 500, default: 25 },
    status: {
      type: String,
      enum: ["draft", "sending", "sent", "failed"],
      default: "draft",
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    stats: {
      targeted: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    error: { type: String, maxlength: 500 },
    recipients: { type: [CampaignRecipientSchema], default: [] },
    sentAt: Date,
  },
  { timestamps: true }
);

CampaignSchema.index({ createdAt: -1 });
CampaignSchema.index({ createdBy: 1, createdAt: -1 });

export default models.Campaign || model<ICampaign>("Campaign", CampaignSchema);
