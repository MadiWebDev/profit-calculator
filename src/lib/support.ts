import { z } from "zod";

/**
 * Support / contact-form submissions (POST /api/support/contact).
 *
 * Submissions are recorded in MongoDB (SupportMessage) and, when Resend
 * is configured, emailed to the support inbox. Recording never depends
 * on email delivery: if sending fails the message is still stored and
 * the route reports emailSent: false.
 */

export const SUPPORT_EMAIL = "hello@getprofitcalc.com";
export const SUPPORT_BUGS_EMAIL = "bugs@getprofitcalc.com";
export const SUPPORT_RESPONSE_TIME = "1–3 business days";

export const SUPPORT_TOPICS = [
  "billing",
  "connect-store",
  "ad-accounts",
  "bug",
  "feature-request",
  "other",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  billing: "Billing & plans",
  "connect-store": "Connecting a store",
  "ad-accounts": "Ad accounts & sync",
  bug: "A bug or a wrong number",
  "feature-request": "Feature request",
  other: "Something else",
};

export const supportSubmissionSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(100),
    email: z.string().trim().max(254).email("Enter a valid email address"),
    topic: z.enum(SUPPORT_TOPICS),
    message: z.string().trim().min(10, "Please describe your question in a little more detail").max(5000),
    /** Honeypot — real humans leave it empty; bots fill it. */
    website: z.string().max(200).optional().default(""),
  })
  .strict();

export type SupportSubmission = z.infer<typeof supportSubmissionSchema>;

export function validateSupportSubmission(input: unknown) {
  return supportSubmissionSchema.safeParse(input);
}

export function isHoneypotFilled(data: SupportSubmission): boolean {
  return data.website.trim().length > 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain, escaped HTML body for the support-inbox email. */
export function buildSupportEmailHtml(data: SupportSubmission): string {
  const topicLabel = SUPPORT_TOPIC_LABELS[data.topic];
  return [
    `<h2>Support request — ${escapeHtml(topicLabel)}</h2>`,
    `<p><strong>From:</strong> ${escapeHtml(data.name)} &lt;${escapeHtml(data.email)}&gt;</p>`,
    `<p><strong>Topic:</strong> ${escapeHtml(topicLabel)}</p>`,
    `<hr/>`,
    `<p>${escapeHtml(data.message).replace(/\n/g, "<br/>")}</p>`,
    `<p style="color:#64748b;font-size:12px;">Sent from the GetProfitCalc Help Center contact form. Reply to the sender's email address above.</p>`,
  ].join("\n");
}
