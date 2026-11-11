import { z } from "zod";
import {
  SUPPORT_TOPICS,
  SUPPORT_TOPIC_LABELS,
  type SupportTopic,
} from "@/lib/support";

/**
 * Admin contact-message inbox (/admin/messages).
 *
 * Pure, testable helpers for the superAdmin-only inbox. Route modules
 * cannot be imported in vitest (their auth chain pulls in next/server),
 * so everything the routes need to decide lives here and is unit-tested
 * in src/lib/__tests__/admin-messages.test.ts.
 */

export const MESSAGE_STATUSES = ["new", "replied", "closed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  new: "New",
  replied: "Replied",
  closed: "Closed",
};

export const messageStatusSchema = z.enum(MESSAGE_STATUSES);

export const DEFAULT_MESSAGES_LIMIT = 20;
export const MAX_MESSAGES_LIMIT = 100;

export interface MessagesQuery {
  page: number;
  limit: number;
  search: string;
  status: MessageStatus | "";
  topic: SupportTopic | "";
}

/** Parse + clamp the list query params. Unknown status/topic are ignored. */
export function parseMessagesQuery(searchParams: URLSearchParams): MessagesQuery {
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_MESSAGES_LIMIT), 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_MESSAGES_LIMIT, Math.max(1, rawLimit))
    : DEFAULT_MESSAGES_LIMIT;

  const statusRaw = searchParams.get("status") ?? "";
  const status: MessageStatus | "" = (MESSAGE_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as MessageStatus)
    : "";
  const topicRaw = searchParams.get("topic") ?? "";
  const topic: SupportTopic | "" = (SUPPORT_TOPICS as readonly string[]).includes(topicRaw)
    ? (topicRaw as SupportTopic)
    : "";

  return { page, limit, search: searchParams.get("search")?.trim() ?? "", status, topic };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mongo filter for the inbox list — newest-first sort lives in the route. */
export function buildMessagesFilter(query: Pick<MessagesQuery, "search" | "status" | "topic">): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    const escaped = escapeRegex(query.search);
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }
  if (query.status) filter.status = query.status;
  if (query.topic) filter.topic = query.topic;
  return filter;
}

/** Body of POST /api/admin/messages/[id]/reply — the reply text only. */
export const adminReplySchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Reply cannot be empty")
      .max(5000, "Reply is too long (max 5000 characters)"),
  })
  .strict();

export type AdminReplyInput = z.infer<typeof adminReplySchema>;

/** Body of PATCH /api/admin/messages — set any of the three statuses. */
export const adminMessageStatusSchema = z
  .object({
    messageId: z.string().trim().min(1, "messageId required"),
    status: messageStatusSchema,
  })
  .strict();

export type AdminMessageStatusInput = z.infer<typeof adminMessageStatusSchema>;

/** Threaded reply subject, e.g. "Re: Billing & plans — GetProfitCalc support". */
export function buildReplySubject(topic: SupportTopic): string {
  return `Re: ${SUPPORT_TOPIC_LABELS[topic]} — GetProfitCalc support`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escaped HTML body for a support reply, quoting the original message. */
export function buildReplyEmailHtml(input: {
  name: string;
  topic: SupportTopic;
  originalMessage: string;
  reply: string;
}): string {
  return [
    `<p>Hi ${escapeHtml(input.name)},</p>`,
    `<p>${escapeHtml(input.reply).replace(/\n/g, "<br/>")}</p>`,
    `<hr/>`,
    `<p style="color:#64748b;font-size:12px;">Your original message (${escapeHtml(SUPPORT_TOPIC_LABELS[input.topic])}):</p>`,
    `<blockquote style="color:#64748b;border-left:3px solid #e2e8f0;padding-left:12px;margin:12px 0;">${escapeHtml(input.originalMessage).replace(/\n/g, "<br/>")}</blockquote>`,
    `<p style="color:#64748b;font-size:12px;">— The GetProfitCalc team. Reply to this email if you need anything else.</p>`,
  ].join("\n");
}

/** Plain row the API returns — no mongoose document, no ObjectIds. */
export interface AdminMessageRow {
  id: string;
  name: string;
  email: string;
  topic: SupportTopic;
  message: string;
  userId: string | null;
  userAgent: string | null;
  status: MessageStatus;
  emailSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessageDocLike {
  _id: unknown;
  name: string;
  email: string;
  topic: SupportTopic;
  message: string;
  userId?: unknown;
  userAgent?: string | null;
  status: MessageStatus;
  emailSent: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function serializeMessage(doc: SupportMessageDocLike): AdminMessageRow {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    topic: doc.topic,
    message: doc.message,
    userId: doc.userId ? String(doc.userId) : null,
    userAgent: doc.userAgent ?? null,
    status: doc.status,
    emailSent: doc.emailSent,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}
