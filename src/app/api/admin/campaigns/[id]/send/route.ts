/**
 * POST /api/admin/campaigns/[id]/send — send a draft campaign.
 *
 * superAdmin-only. Draft → sending → sent. Only a draft can be sent, and
 * the status flips to "sending" before the first message goes out, so a
 * double-click or retried request can never re-blast the audience.
 *
 * Guardrails:
 * - Provider credentials are preflighted BEFORE any message is sent; a
 *   missing RESEND_API_KEY / WHATSAPP_* var answers 503 and the campaign
 *   stays a draft.
 * - Audience is capped at CAMPAIGN_AUDIENCE_CAP (500) recipients per
 *   send, oldest users first; the overflow is reported, never sent.
 *   "limited" audiences target the N oldest users (N picked by the
 *   admin, 1–500, default 25); "users" audiences target exactly the
 *   users stored at create time — a user deleted between create and
 *   send is recorded as a skipped recipient with an error, never
 *   silently dropped.
 * - WhatsApp recipients without a phone number, or with a number that is
 *   not valid E.164, are recorded as "skipped" with the reason — never
 *   treated as failures, never retried silently.
 * - Every recipient outcome is stored on the campaign with the
 *   provider's exact error text on failure (including Meta's template
 *   errors), and a "campaign.sent" audit entry records the totals.
 * - Sends run in small batches (5 at a time) to bound provider pressure.
 *
 * No scheduling in v1 — this sends immediately when the admin confirms.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel, { type ICampaignRecipient } from "@/models/Campaign";
import UserModel from "@/models/User";
import { requireSuperAdmin, resolveAdminTeamId } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import {
  buildAudienceFilter,
  CAMPAIGN_AUDIENCE_CAP,
  findMissingUserIds,
  orderUsersByStoredIds,
  renderCampaignEmailHtml,
  resolveAudienceLimit,
  resolveCampaignSubject,
} from "@/lib/campaigns";
import {
  sendCampaignEmail,
  sendWhatsAppTemplateMessage,
} from "@/lib/campaign-send";
import { isValidPhoneE164 } from "@/lib/whatsapp";

/** Sends per batch — bounds provider pressure on a large audience. */
const SEND_BATCH_SIZE = 5;

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const rl = await withRateLimit(_req, "strict", "campaign-send");
  if (rl) return rl;

  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  await connectDB();
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return fail(`Campaign is ${campaign.status} and cannot be sent`, 409, "CAMPAIGN_NOT_DRAFT");
  }

  // Preflight: never start a send we cannot finish for credential reasons.
  if (campaign.channel === "email" && !process.env.RESEND_API_KEY) {
    return fail(
      "RESEND_API_KEY is not configured — set it in production and try again. No message was sent.",
      503,
      "EMAIL_NOT_CONFIGURED"
    );
  }
  if (
    campaign.channel === "whatsapp" &&
    (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)
  ) {
    return fail(
      "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured — set them in production and try again. No message was sent.",
      503,
      "WHATSAPP_NOT_CONFIGURED"
    );
  }

  // Flip to "sending" first: a second send request now sees a non-draft.
  campaign.status = "sending";
  await campaign.save();

  try {
    // Audience: same base filter as the create-time estimate (no phone
    // condition), oldest first, capped. Skips are decided per recipient
    // below so the admin sees the honest skipped count.
    //
    // - "limited": the audience is the N oldest users — the batch size
    //   is the query limit (clamped server-side), not a filter, so
    //   there is no cap overflow to report.
    // - "users": re-fetch the stored ids from the DB. A user deleted
    //   between create and send is recorded as a skipped recipient
    //   with an error, never silently dropped; the rest go out in the
    //   admin's stored order.
    const isLimited = campaign.audienceType === "limited";
    const isUsers = campaign.audienceType === "users";
    const baseFilter = buildAudienceFilter({
      audienceType: campaign.audienceType,
      audiencePlan: campaign.audiencePlan,
      audienceTeamId: campaign.audienceTeamId?.toString(),
      audienceUserIds: (campaign.audienceUserIds ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
      channel: "email",
    });

    let users;
    let overflow = 0;
    let missingRecipients: ICampaignRecipient[] = [];
    if (isLimited) {
      const limit = resolveAudienceLimit(campaign.audienceLimit);
      users = await UserModel.find(baseFilter)
        .sort({ createdAt: 1 })
        .limit(limit)
        .select("name email phone")
        .lean();
    } else {
      const totalMatched = await UserModel.countDocuments(baseFilter);
      users = await UserModel.find(baseFilter)
        .sort({ createdAt: 1 })
        .limit(CAMPAIGN_AUDIENCE_CAP)
        .select("name email phone")
        .lean();
      overflow = totalMatched > CAMPAIGN_AUDIENCE_CAP ? totalMatched - CAMPAIGN_AUDIENCE_CAP : 0;
      if (isUsers) {
        const storedIds = (campaign.audienceUserIds ?? []).map((id: mongoose.Types.ObjectId) =>
          id.toString()
        );
        users = orderUsersByStoredIds(users, storedIds);
        missingRecipients = findMissingUserIds(
          storedIds,
          users.map((u) => u._id.toString())
        ).map((id) => ({
          userId: new mongoose.Types.ObjectId(id),
          identifier: id,
          status: "skipped" as const,
          error: "User no longer exists",
        }));
      }
    }

    const subject =
      campaign.channel === "email"
        ? resolveCampaignSubject(campaign.templateType, campaign.subject)
        : undefined;

    // Deleted users (users audience only) are already recorded as
    // skipped before the first message goes out.
    const recipients: ICampaignRecipient[] = [...missingRecipients];
    const counts = {
      targeted: users.length + missingRecipients.length,
      sent: 0,
      failed: 0,
      skipped: missingRecipients.length,
    };

    for (let i = 0; i < users.length; i += SEND_BATCH_SIZE) {
      const batch = users.slice(i, i + SEND_BATCH_SIZE);
      const outcomes = await Promise.all(
        batch.map(async (user): Promise<ICampaignRecipient> => {
          const identifier =
            campaign.channel === "email" ? user.email : (user.phone ?? "").trim();
          const base: ICampaignRecipient = {
            userId: user._id,
            identifier: identifier || user.email,
            status: "failed",
          };

          if (campaign.channel === "whatsapp") {
            if (!user.phone) {
              return { ...base, status: "skipped", error: "No phone number on file" };
            }
            if (!isValidPhoneE164(user.phone)) {
              return { ...base, status: "skipped", error: "Phone number is not valid E.164" };
            }
            const result = await sendWhatsAppTemplateMessage(
              user.phone.trim(),
              campaign.whatsappTemplateName ?? "",
              user.name ?? ""
            );
            if (result.ok) {
              return { ...base, status: "sent", sentAt: new Date() };
            }
            return { ...base, status: "failed", error: (result.error ?? "WhatsApp send failed").slice(0, 500) };
          }

          try {
            await sendCampaignEmail(
              user.email,
              subject ?? "",
              renderCampaignEmailHtml(campaign.body, user.name ?? "")
            );
            return { ...base, status: "sent", sentAt: new Date() };
          } catch (e) {
            return {
              ...base,
              status: "failed",
              error: (e instanceof Error ? e.message : "Email send failed").slice(0, 500),
            };
          }
        })
      );
      for (const outcome of outcomes) {
        recipients.push(outcome);
        counts[outcome.status === "sent" ? "sent" : outcome.status === "failed" ? "failed" : "skipped"]++;
      }
    }

    campaign.recipients = recipients;
    campaign.stats = counts;
    campaign.status = "sent";
    campaign.sentAt = new Date();
    await campaign.save();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminId = (session.user as any)?.id as string;
    const teamId = await resolveAdminTeamId(session);
    if (teamId) {
      await logAudit({
        teamId,
        userId: adminId,
        action: "campaign.sent",
        description:
          `Sent campaign "${campaign.name}" (${campaign.channel}): ` +
          `${counts.sent} sent, ${counts.failed} failed, ${counts.skipped} skipped of ${counts.targeted} targeted` +
          (overflow > 0 ? ` (${overflow} over the ${CAMPAIGN_AUDIENCE_CAP} cap, not sent)` : ""),
        resourceType: "Campaign",
        resourceId: campaign._id.toString(),
        metadata: { ...counts, overflow, channel: campaign.channel, templateType: campaign.templateType },
      });
    }

    return NextResponse.json({
      success: true,
      id: campaign._id.toString(),
      status: "sent",
      stats: counts,
      overflow,
      audienceCap: CAMPAIGN_AUDIENCE_CAP,
    });
  } catch (err) {
    logger.error("campaign send failed", toLogError(err));
    campaign.status = "failed";
    campaign.error = (err instanceof Error ? err.message : "Campaign send failed").slice(0, 500);
    await campaign.save().catch(() => undefined);
    return fail("Campaign send failed partway — check the campaign for per-recipient results", 500, "CAMPAIGN_SEND_FAILED");
  }
}
