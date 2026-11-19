/**
 * Shared types for the Campaign Center tabs (Phase 3). These lived in
 * CampaignsClient.tsx; they are extracted so the tab components can
 * import them without pulling in the whole shell.
 */

export type Channel = "email" | "whatsapp";
export type TemplateType =
  | "announcement"
  | "product_update"
  | "trial_ending"
  | "billing_notice"
  | "feature_launch";
export type AudienceType = "all" | "plan" | "team" | "users" | "limited";
export type RecipientStatus =
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

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  announcement: "Announcement",
  product_update: "Product update",
  trial_ending: "Trial ending",
  billing_notice: "Billing notice",
  feature_launch: "Feature launch",
};

export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  sending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  sent: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export const RECIPIENT_STATUS_STYLES: Record<RecipientStatus, string> = {
  sent: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  skipped: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  opened: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  clicked: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  bounced: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  complained: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  read: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  suppressed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export interface CampaignRow {
  id: string;
  name: string;
  channel: Channel;
  templateType: TemplateType;
  subject: string | null;
  body: string;
  whatsappTemplateName: string | null;
  audienceType: AudienceType;
  audiencePlan: string | null;
  audienceTeamId: string | null;
  audienceUserIds: string[];
  audienceLimit: number | null;
  status: "draft" | "sending" | "sent" | "failed";
  stats: {
    targeted: number;
    sent: number;
    failed: number;
    skipped: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    read: number;
    suppressed: number;
  };
  error: string | null;
  archived: boolean;
  archivedAt: string | null;
  createdBy: { name: string; email: string } | null;
  sentAt: string | null;
  createdAt: string;
}

export interface RecipientRow {
  userId: string | null;
  identifier: string;
  status: RecipientStatus;
  error: string | null;
  sentAt: string | null;
  /** Webhook-reported milestones (Phase 2); null until the event lands. */
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  readAt: string | null;
  failedAt: string | null;
}

export interface TeamRow {
  id: string;
  name: string;
  plan: string;
}

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  hasPhone: boolean;
  createdAt: string;
}

export interface LastMessage {
  campaignId: string;
  campaignName: string;
  channel: Channel;
  status: RecipientStatus;
  sentAt: string | null;
}

/** One row of GET /api/admin/direct-messages — a sent (or failed) direct message. */
export interface DirectMessageRow {
  id: string;
  userId: string;
  identifier: string;
  userName: string;
  channel: Channel;
  subject: string;
  body: string;
  whatsappTemplateName: string | null;
  status: "sent" | "failed";
  providerMessageId: string | null;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

export const inputCls =
  "h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm";
