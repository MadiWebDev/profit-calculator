/**
 * Direct messages — one message to one user, no campaign. The Campaign
 * Center user directory's Message button opens a dialog; this lib is
 * the send orchestration behind POST /api/admin/direct-messages. The
 * route is a thin wrapper (auth, rate limit, audit); everything
 * testable lives here so the DB suite can prove it without a browser.
 *
 * Refusals BEFORE any provider call (suppressed, unsubscribed, no
 * phone, invalid template, missing credentials) throw
 * DirectMessageError and create NO record — the admin sees the refusal
 * in the dialog immediately. A provider rejection creates a FAILED
 * record with the provider's exact error, so there is a trail.
 *
 * Suppression is enforced with no admin override (same rule as
 * campaigns): the MessageSuppression list AND the user's recorded
 * opt-out timestamps (emailUnsubscribedAt / whatsappUnsubscribedAt,
 * stamped by the Phase 2 complaint webhook) both block the send.
 *
 * Email reuses the campaign renderer: {{name}} substitution, HTML
 * escaping, and the unsubscribe footer. WhatsApp sends a Meta-approved
 * template only — the admin types the template name, never free text.
 */
import { z } from "zod";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import DirectMessageModel, {
  type IDirectMessage,
  type DirectMessageChannel,
} from "@/models/DirectMessage";
import {
  sendCampaignEmail,
  sendWhatsAppTemplateMessage,
} from "@/lib/campaign-send";
import {
  isValidWhatsAppTemplateName,
  renderCampaignEmailHtml,
} from "@/lib/campaigns";
import { isValidPhoneE164 } from "@/lib/whatsapp";
import { isSuppressed } from "@/lib/suppression";

/** Refusal before any provider call — carries the HTTP status + code. */
export class DirectMessageError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const DirectMessageBodySchema = z
  .object({
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
    channel: z.enum(["email", "whatsapp"]),
    subject: z.string().trim().max(200, "Subject too long").optional(),
    body: z.string().trim().max(5000, "Body too long").optional(),
    whatsappTemplateName: z.string().trim().max(512).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.channel === "email" && !v.body) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Message body is required" });
    }
    if (v.channel === "whatsapp") {
      if (!v.whatsappTemplateName) {
        ctx.addIssue({
          code: "custom",
          path: ["whatsappTemplateName"],
          message: "Template name is required for WhatsApp",
        });
      } else if (!isValidWhatsAppTemplateName(v.whatsappTemplateName)) {
        ctx.addIssue({
          code: "custom",
          path: ["whatsappTemplateName"],
          message: "Template name must be lowercase letters, digits and underscores only",
        });
      }
    }
  });

export type DirectMessageInput = z.infer<typeof DirectMessageBodySchema>;

export interface SendDirectMessageDeps {
  createdBy: string;
  /** Test seam: replaces the Resend call (same shape as campaign sends). */
  emailSendImpl?: Parameters<typeof sendCampaignEmail>[3];
  /** Test seam: replaces fetch for the Meta Graph call. */
  whatsappFetchImpl?: Parameters<typeof sendWhatsAppTemplateMessage>[3];
}

export async function sendDirectMessage(
  input: DirectMessageInput,
  deps: SendDirectMessageDeps
): Promise<IDirectMessage> {
  const { channel } = input;
  await connectDB();

  const user = await UserModel.findById(input.userId).lean();
  if (!user) {
    throw new DirectMessageError(404, "USER_NOT_FOUND", "User not found");
  }
  const userName = user.name ?? "";
  const identifier =
    channel === "email" ? user.email : (user.phone ?? "").trim();

  // WhatsApp needs a usable number before anything else is checked —
  // there is no identifier to suppress-check without one.
  if (channel === "whatsapp") {
    if (!user.phone) {
      throw new DirectMessageError(400, "NO_PHONE", "This user has no phone number on file");
    }
    if (!isValidPhoneE164(user.phone)) {
      throw new DirectMessageError(
        400,
        "INVALID_PHONE",
        "This user's phone number is not valid E.164"
      );
    }
  }

  // Suppression + recorded opt-out — no override at send time.
  if (await isSuppressed(identifier, channel)) {
    throw new DirectMessageError(
      409,
      "DIRECT_MESSAGE_SUPPRESSED",
      channel === "email"
        ? "This email address is on the suppression list"
        : "This phone number is on the suppression list"
    );
  }
  const unsubscribedAt =
    channel === "email" ? user.emailUnsubscribedAt : user.whatsappUnsubscribedAt;
  if (unsubscribedAt) {
    throw new DirectMessageError(
      409,
      "DIRECT_MESSAGE_UNSUBSCRIBED",
      "This user has unsubscribed from this channel"
    );
  }

  // Credential preflight — a missing key is a 503 with no record,
  // never a failed send (mirrors the campaign send route).
  if (channel === "email" && !process.env.RESEND_API_KEY) {
    throw new DirectMessageError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "Email is not configured (RESEND_API_KEY is missing)"
    );
  }
  if (
    channel === "whatsapp" &&
    (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)
  ) {
    throw new DirectMessageError(
      503,
      "WHATSAPP_NOT_CONFIGURED",
      "WhatsApp is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are missing)"
    );
  }

  let status: "sent" | "failed";
  let providerMessageId: string | undefined;
  let error: string | undefined;

  if (channel === "email") {
    try {
      const messageId = await sendCampaignEmail(
        user.email,
        input.subject ?? "",
        renderCampaignEmailHtml(input.body ?? "", userName),
        deps.emailSendImpl
      );
      status = "sent";
      providerMessageId = messageId;
    } catch (e) {
      status = "failed";
      error = (e instanceof Error ? e.message : "Email send failed").slice(0, 500);
    }
  } else {
    const result = await sendWhatsAppTemplateMessage(
      user.phone.trim(),
      input.whatsappTemplateName ?? "",
      userName,
      deps.whatsappFetchImpl
    );
    if (result.ok) {
      status = "sent";
      providerMessageId = result.messageId;
    } else if (result.skipped) {
      // Credentials vanished between preflight and send — treat as a
      // config failure, not a per-message failure.
      throw new DirectMessageError(
        503,
        "WHATSAPP_NOT_CONFIGURED",
        "WhatsApp is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are missing)"
      );
    } else {
      status = "failed";
      error = (result.error ?? "WhatsApp send failed").slice(0, 500);
    }
  }

  const doc = await DirectMessageModel.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    identifier,
    userName: userName || identifier,
    channel,
    subject: channel === "email" ? (input.subject ?? "") : "",
    body: channel === "email" ? (input.body ?? "") : "",
    whatsappTemplateName:
      channel === "whatsapp" ? (input.whatsappTemplateName ?? "") : undefined,
    status,
    ...(providerMessageId ? { providerMessageId } : {}),
    ...(error ? { error } : {}),
    ...(status === "sent" ? { sentAt: new Date() } : {}),
    createdBy: new mongoose.Types.ObjectId(deps.createdBy),
  });
  return doc;
}
