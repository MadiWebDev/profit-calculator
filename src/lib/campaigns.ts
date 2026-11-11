/**
 * Campaign helpers — PURE module. No sending, no credentials, no network,
 * no database. The admin API routes take these outputs and hand them to
 * the senders in src/lib/campaign-send.ts.
 *
 * Template variables: the campaign body may use {{name}} (the
 * recipient's first name). Unknown placeholders are left as-is so a typo
 * is visible instead of silently vanishing (same contract as
 * renderTemplate() in src/lib/whatsapp.ts, which this reuses).
 */
import mongoose from "mongoose";
import { renderTemplate, type TemplateVars } from "@/lib/whatsapp";
import type {
  CampaignAudienceType,
  CampaignChannel,
  CampaignRecipientStatus,
  CampaignTemplateType,
} from "@/models/Campaign";

/** Hard cap on recipients per send — a send can never run unbounded. */
export const CAMPAIGN_AUDIENCE_CAP = 500;

/** Default size of a "limited" audience when the admin omits the limit. */
export const CAMPAIGN_AUDIENCE_LIMIT_DEFAULT = 25;

/** Hard cap on a "limited" audience — same bound as the per-send cap. */
export const CAMPAIGN_AUDIENCE_LIMIT_MAX = 500;

export const CAMPAIGN_TEMPLATE_TYPES: {
  value: CampaignTemplateType;
  label: string;
  defaultSubject: string;
}[] = [
  { value: "announcement",   label: "Announcement",  defaultSubject: "An update from GetProfitCalc" },
  { value: "product_update", label: "Product update", defaultSubject: "What's new in GetProfitCalc" },
  { value: "trial_ending",   label: "Trial ending",  defaultSubject: "Your GetProfitCalc trial is ending soon" },
  { value: "billing_notice", label: "Billing notice", defaultSubject: "Important: your GetProfitCalc billing" },
  { value: "feature_launch", label: "Feature launch", defaultSubject: "New feature: now live in GetProfitCalc" },
];

export const CAMPAIGN_CHANNELS: { value: CampaignChannel; label: string }[] = [
  { value: "email",    label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

export const CAMPAIGN_PLANS = ["free", "starter", "growth", "pro"] as const;

export function defaultSubjectFor(templateType: CampaignTemplateType): string {
  return (
    CAMPAIGN_TEMPLATE_TYPES.find((t) => t.value === templateType)?.defaultSubject
    ?? "An update from GetProfitCalc"
  );
}

/**
 * Resolve the email subject: the admin's custom subject wins, otherwise
 * the template type's default. A blank custom subject also falls back
 * to the default — a campaign email never goes out subject-less.
 */
export function resolveCampaignSubject(
  templateType: CampaignTemplateType,
  subject?: string
): string {
  const custom = (subject ?? "").trim();
  return custom ? custom : defaultSubjectFor(templateType);
}

/**
 * Meta WhatsApp template names are lowercase letters, digits and
 * underscores only. Anything else is rejected before we ever call Meta
 * — the admin must type the exact approved name from Business Manager.
 */
export function isValidWhatsAppTemplateName(name: string): boolean {
  return /^[a-z0-9_]{1,512}$/.test(name.trim());
}

/** First name for the {{name}} placeholder ("Ayesha Khan" → "Ayesha"). */
export function firstNameOf(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function campaignTemplateVars(recipientName: string): TemplateVars {
  return { name: firstNameOf(recipientName) };
}

/** Escape HTML so a plain-text campaign body renders safely as email. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Unsubscribe footer built into EVERY campaign email (v1: reply-to
 * unsubscribe — there is no one-click unsubscribe endpoint yet; the
 * footer says exactly that and tells the recipient what to do).
 */
export const UNSUBSCRIBE_FOOTER_TEXT =
  "You received this email because you have a GetProfitCalc account. " +
  "To stop receiving these messages, reply to this email with “Unsubscribe”. " +
  "GetProfitCalc — https://getprofitcalc.com";

export function unsubscribeFooterHtml(): string {
  return `<p style="color:#64748b;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;">${escapeHtml(UNSUBSCRIBE_FOOTER_TEXT)}</p>`;
}

/**
 * Render the final campaign email HTML for one recipient: the body is
 * treated as plain text (HTML-escaped, newlines → <br/>), {{name}} is
 * substituted, and the unsubscribe footer is always appended.
 */
export function renderCampaignEmailHtml(body: string, recipientName: string): string {
  const rendered = renderTemplate(body, campaignTemplateVars(recipientName));
  const safe = escapeHtml(rendered).replace(/\n/g, "<br/>");
  return `<p>Hi ${escapeHtml(firstNameOf(recipientName) || "there")},</p><p>${safe}</p>${unsubscribeFooterHtml()}`;
}

/**
 * WhatsApp template body parameter for one recipient: {{1}} is the
 * recipient's first name. Templates without variables ignore the extra
 * parameter on Meta's side only if they declare none — if Meta rejects
 * the send, the exact error is surfaced per recipient (see
 * sendWhatsAppTemplateMessage in campaign-send.ts).
 */
export function whatsappTemplateBodyParameters(recipientName: string): { type: "text"; text: string }[] {
  return [{ type: "text", text: firstNameOf(recipientName) || "there" }];
}

export interface CampaignAudienceInput {
  audienceType: CampaignAudienceType;
  audiencePlan?: "free" | "starter" | "growth" | "pro";
  audienceTeamId?: string;
  /** "users" only: the specific user ids targeted (de-duplicated by the filter). */
  audienceUserIds?: string[];
  /** "limited" only: the batch size — applied as a query limit, not a filter. */
  audienceLimit?: number;
  channel: CampaignChannel;
}

/**
 * De-duplicate a list of user ObjectId strings, keeping the first
 * occurrence order. Assumes every entry already passed ObjectId
 * validation (zod `objectIdString` at the route layer).
 */
export function dedupeObjectIdStrings(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Resolve the effective "limited" audience size: the admin-picked
 * limit, defaulting to CAMPAIGN_AUDIENCE_LIMIT_DEFAULT when omitted,
 * clamped into 1..CAMPAIGN_AUDIENCE_LIMIT_MAX. The clamp is the
 * server-side enforcement — a limit above the cap is silently reduced
 * to the cap, never rejected (the create-time zod schema already
 * rejects out-of-range values, but a stored value is re-clamped at
 * send time so it can never grow past the cap).
 */
export function resolveAudienceLimit(limit?: number | null): number {
  const n = limit ?? CAMPAIGN_AUDIENCE_LIMIT_DEFAULT;
  if (!Number.isFinite(n)) return CAMPAIGN_AUDIENCE_LIMIT_DEFAULT;
  return Math.min(CAMPAIGN_AUDIENCE_LIMIT_MAX, Math.max(1, Math.floor(n)));
}

/**
 * Which of the user ids stored on a campaign at create time are no
 * longer present in the users fetched at send time — i.e. users deleted
 * between create and send. The send route records each of these as a
 * skipped recipient with an error, never silently drops them.
 */
export function findMissingUserIds(storedIds: string[], foundIds: string[]): string[] {
  const found = new Set(foundIds);
  return dedupeObjectIdStrings(storedIds).filter((id) => !found.has(id));
}

/**
 * Re-order fetched users to match the order of the ids stored on the
 * campaign, so a "users" send goes out in the admin's chosen order.
 * Users not in the stored list (should not happen) keep their place
 * at the end, in their original order.
 */
export function orderUsersByStoredIds<T extends { _id: { toString(): string } }>(
  users: T[],
  storedIds: string[]
): T[] {
  const order = new Map(dedupeObjectIdStrings(storedIds).map((id, i) => [id, i]));
  return [...users].sort((a, b) => {
    const ai = order.get(a._id.toString());
    const bi = order.get(b._id.toString());
    if (ai === undefined && bi === undefined) return 0;
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    return ai - bi;
  });
}

/**
 * Create-time audience estimate from the two counts the route queries:
 * how many users match the audience, and how many of them have a usable
 * contact for the channel. The "without contact" users are the ones the
 * send route will record as skipped.
 */
export function computeAudienceEstimate(matched: number, withContact: number): {
  matched: number;
  withContact: number;
  withoutContact: number;
  willSend: number;
  capped: number;
} {
  return {
    matched,
    withContact,
    withoutContact: matched - withContact,
    willSend: Math.min(withContact, CAMPAIGN_AUDIENCE_CAP),
    capped: Math.max(0, withContact - CAMPAIGN_AUDIENCE_CAP),
  };
}

/**
 * Build the Mongo filter for the campaign audience.
 * - all: every user.
 * - plan: users on that plan.
 * - team: users on that team.
 * - users: exactly the listed users (de-duplicated, as ObjectIds).
 * - limited: every user — the batch size is a query limit (oldest
 *   first), not a filter, so this filter is empty.
 * - WhatsApp additionally requires a phone number on file; users without
 *   one are excluded here and never counted as "targeted" — the skipped
 *   count is reported separately by the send route (matched users with
 *   no/invalid number), so the admin sees the real audience size.
 */
export function buildAudienceFilter(
  input: CampaignAudienceInput
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (input.audienceType === "plan" && input.audiencePlan) {
    filter.plan = input.audiencePlan;
  }
  if (input.audienceType === "team" && input.audienceTeamId) {
    filter.teamId = new mongoose.Types.ObjectId(input.audienceTeamId);
  }
  if (input.audienceType === "users" && input.audienceUserIds?.length) {
    filter._id = {
      $in: dedupeObjectIdStrings(input.audienceUserIds).map(
        (id) => new mongoose.Types.ObjectId(id)
      ),
    };
  }
  if (input.channel === "whatsapp") {
    filter.phone = { $exists: true, $ne: "" };
  }
  return filter;
}

/**
 * Split a matched audience into the send list (capped) and the overflow
 * that is never sent. The cap makes a send bounded even if the audience
 * selector matches the whole user base.
 */
export function capAudience<T>(recipients: T[]): { send: T[]; capped: number } {
  if (recipients.length <= CAMPAIGN_AUDIENCE_CAP) {
    return { send: recipients, capped: 0 };
  }
  return {
    send: recipients.slice(0, CAMPAIGN_AUDIENCE_CAP),
    capped: recipients.length - CAMPAIGN_AUDIENCE_CAP,
  };
}

/**
 * One row of the "last message per user" lookup: the most recent
 * campaign a user was a recipient of, with that recipient's outcome.
 * Produced by the aggregation in GET /api/admin/campaigns/last-message
 * (one query for a page of users — never one fetch per user).
 */
export interface LastMessageRow {
  userId: string;
  campaignId: string;
  campaignName: string;
  channel: CampaignChannel;
  status: CampaignRecipientStatus;
  /** ISO date the message went out (campaign sentAt, falling back to the recipient's sentAt). */
  sentAt: string | null;
}

/**
 * Build the per-user latest-message map from aggregation rows. Rows
 * are expected newest-first per user; the first row seen for a user
 * wins, later rows for the same user are ignored. Rows with a missing
 * userId are dropped — a recipient row always carries one, so a
 * missing id means a malformed row, not a user with no message.
 */
export function buildLastMessageMap(rows: LastMessageRow[]): Record<string, LastMessageRow> {
  const map: Record<string, LastMessageRow> = {};
  for (const row of rows) {
    if (!row.userId) continue;
    if (!(row.userId in map)) map[row.userId] = row;
  }
  return map;
}
