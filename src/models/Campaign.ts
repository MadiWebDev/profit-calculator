import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Campaign — a superAdmin-authored bulk message to users, sent by email
 * (Resend) or WhatsApp (Meta WhatsApp Cloud API, template message).
 *
 * Lifecycle: draft → sending → sent (or failed when the send could not
 * start at all, e.g. provider credentials missing). A campaign is sent
 * at most once per attempt: only drafts and failed campaigns can be
 * sent, and the send route claims the campaign atomically (see
 * buildSendClaimFilter in src/lib/campaigns.ts), so two concurrent
 * send requests cannot both blast the audience. A failed campaign can
 * be re-sent: recipients already recorded as "sent" are carried over
 * and never re-sent, the rest are retried — the resume, not a re-blast.
 * A campaign stranded in "sending" (request died mid-send) is
 * recovered via POST /api/admin/campaigns/[id]/cancel, which flips it
 * to "failed" so it can be re-sent from its saved partial progress.
 *
 * Per-recipient outcomes are stored on the campaign itself so the admin
 * can see exactly who got the message, who failed (with the provider's
 * error text), and who was skipped (no phone number on file for
 * WhatsApp, or an invalid one). providerMessageId is the id the
 * provider assigned at send time (Resend id, Meta wamid) — the key
 * webhook events correlate back to this recipient (Phase 2).
 * Recipient identifiers are stored unmasked — this collection is
 * superAdmin-only.
 *
 * Audience cap: at most CAMPAIGN_AUDIENCE_CAP recipients per send
 * (see src/lib/campaigns.ts). Anything above the cap is never sent;
 * the over-cap count is persisted in stats.overflow. No scheduling
 * in v1 — a send happens immediately when the admin confirms it.
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

export type CampaignRecipientStatus =
  | "sent"
  | "failed"
  | "skipped"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "read"
  | "suppressed";

export interface ICampaignRecipient {
  userId?: mongoose.Types.ObjectId;
  /** Email address (email channel) or phone number (WhatsApp channel). */
  identifier: string;
  /**
   * Derived current status. "sent" means only "the provider API
   * returned 200" — delivery is reported by webhooks (Phase 2) and
   * moves this forward through the transition table in
   * src/lib/message-events.ts; the append-only MessageEvent log keeps
   * every provider event even when a transition is not valid.
   */
  status: CampaignRecipientStatus;
  /** Provider error text for "failed", or the skip reason for "skipped". */
  error?: string;
  sentAt?: Date;
  /** Provider-assigned message id (Resend id / Meta wamid), when sent. */
  providerMessageId?: string;
  /**
   * Webhook-reported milestones (Phase 2). Each is set when the
   * recipient's derived status first reaches that state; "failedAt"
   * also covers bounced (a bounce is a delivery failure). Absence of
   * a timestamp proves nothing about the provider — e.g. "opened" is
   * estimated (Apple Mail Privacy Protection pre-loads the pixel) and
   * WhatsApp "read" never fires when the recipient has read receipts
   * off.
   */
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  readAt?: Date;
  failedAt?: Date;
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
  /**
   * Phase 3: soft-archive. An archived campaign is hidden from the
   * default list (and can never be sent — the send claim only accepts
   * draft/failed), but its records, recipients, and delivery history
   * are preserved. Unarchive restores it to the list. This is a flag,
   * not a status value, so the lifecycle enum stays untouched.
   */
  archived?: boolean;
  archivedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  /** Totals from the last send attempt (0 while a draft). */
  stats: {
    targeted: number;
    sent: number;
    failed: number;
    skipped: number;
    /** Recipients over the 500 cap that were never sent. */
    overflow: number;
    /**
     * Webhook-derived totals (Phase 2), recomputed from the recipients
     * array — the same single source of truth as the four send-time
     * counters. "sent" still means "provider accepted"; delivery is
     * "delivered" and beyond. All 0 until the first webhook lands.
     */
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    read: number;
    suppressed: number;
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
      enum: [
        "sent",
        "failed",
        "skipped",
        "delivered",
        "opened",
        "clicked",
        "bounced",
        "complained",
        "read",
        "suppressed",
      ],
      required: true,
    },
    error: { type: String, maxlength: 500 },
    sentAt: Date,
    /** Provider-assigned message id (Resend id / Meta wamid), when sent. */
    providerMessageId: { type: String, maxlength: 128 },
    deliveredAt: Date,
    openedAt: Date,
    clickedAt: Date,
    readAt: Date,
    failedAt: Date,
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
      overflow: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      complained: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      suppressed: { type: Number, default: 0 },
    },
    error: { type: String, maxlength: 500 },
    recipients: { type: [CampaignRecipientSchema], default: [] },
    sentAt: Date,
    archived: { type: Boolean, default: false },
    archivedAt: Date,
  },
  { timestamps: true }
);

CampaignSchema.index({ createdAt: -1 });
CampaignSchema.index({ createdBy: 1, createdAt: -1 });
CampaignSchema.index({ archived: 1, createdAt: -1 });

export default models.Campaign || model<ICampaign>("Campaign", CampaignSchema);
