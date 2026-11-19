/**
 * POST /api/admin/campaigns/[id]/send — send a draft (or failed) campaign.
 *
 * superAdmin-only. Draft/failed → sending → sent. The claim is ATOMIC:
 * a single findOneAndUpdate() with a status condition (see
 * buildSendClaimFilter in src/lib/campaigns.ts), so two concurrent send
 * requests cannot both blast the audience — only the first claim
 * matches, the second answers 409.
 *
 * Re-send resumes: a failed campaign can be sent again, and recipients
 * already recorded as "sent" are carried over and never re-sent. The
 * rest are retried. A campaign stranded in "sending" (the request died
 * mid-send) is recovered via POST /api/admin/campaigns/[id]/cancel,
 * which flips it to "failed" so it can be re-sent from its saved
 * partial progress.
 *
 * Progress is persisted after every batch, not only at the end — a
 * timeout or crash mid-send leaves the campaign's recipients and stats
 * as far as they got, instead of an empty "sending" with nothing to
 * show for it. A mid-send infrastructure failure marks the campaign
 * "failed" WITH its accumulated per-recipient outcomes saved.
 *
 * Guardrails:
 * - Provider credentials are preflighted BEFORE the claim; a missing
 *   RESEND_API_KEY / WHATSAPP_* var answers 503 and the campaign is
 *   untouched (still a draft / still failed).
 * - Audience is capped at CAMPAIGN_AUDIENCE_CAP (500) recipients per
 *   send, oldest users first; the overflow is persisted in
 *   stats.overflow, never sent. "limited" audiences target the N
 *   oldest users (N picked by the admin, 1–500, default 25); "users"
 *   audiences target exactly the users stored at create time — a user
 *   deleted between create and send is recorded as a skipped recipient
 *   with an error, never silently dropped.
 * - WhatsApp recipients without a phone number, or with a number that
 *   is not valid E.164, are recorded as "skipped" with the reason —
 *   never treated as failures, never retried silently.
 * - Every recipient outcome is stored on the campaign with the
 *   provider's exact error text on failure (including Meta's template
 *   errors) and the provider message id on success (Resend id, Meta
 *   wamid) so webhook events can correlate back to it (Phase 2).
 * - Sends run in small batches (5 at a time) to bound provider pressure.
 *
 * No scheduling in v1 — this sends immediately when the admin confirms.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel, { type ICampaignRecipient } from "@/models/Campaign";
import UserModel from "@/models/User";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/validation";
import { logAdminAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import {
  buildAudienceFilter,
  buildSendClaimFilter,
  buildSendClaimUpdate,
  CAMPAIGN_AUDIENCE_CAP,
  findMissingUserIds,
  orderUsersByStoredIds,
  renderCampaignEmailHtml,
  resolveAudienceLimit,
  resolveCampaignSubject,
  SENDABLE_CAMPAIGN_STATUSES,
  summarizeRecipients,
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
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(_req, "strict", `campaign-send:${adminId}`);
  if (rl) return rl;

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  await connectDB();
  const existing = await CampaignModel.findById(id);
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!(SENDABLE_CAMPAIGN_STATUSES as readonly string[]).includes(existing.status)) {
    return fail(`Campaign is ${existing.status} and cannot be sent`, 409, "CAMPAIGN_NOT_DRAFT");
  }
  const wasFailed = existing.status === "failed";

  // Preflight: never start a send we cannot finish for credential reasons.
  if (existing.channel === "email" && !process.env.RESEND_API_KEY) {
    return fail(
      "RESEND_API_KEY is not configured — set it in production and try again. No message was sent.",
      503,
      "EMAIL_NOT_CONFIGURED"
    );
  }
  if (
    existing.channel === "whatsapp" &&
    (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)
  ) {
    return fail(
      "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured — set them in production and try again. No message was sent.",
      503,
      "WHATSAPP_NOT_CONFIGURED"
    );
  }

  // Atomic claim: only one concurrent send can win this. A loser sees
  // no document and answers 409 — the campaign is already sending.
  const campaign = await CampaignModel.findOneAndUpdate(
    buildSendClaimFilter(id),
    buildSendClaimUpdate(),
    { new: true }
  );
  if (!campaign) {
    return fail("Campaign is already sending and cannot be sent again", 409, "CAMPAIGN_NOT_DRAFT");
  }

  // Resume: recipients already recorded as "sent" in a previous
  // attempt are carried over and never re-sent. Keyed by user id when
  // known, falling back to the identifier (deleted users have no id
  // in the fetched set, so their carried-over row survives on the
  // identifier key).
  const previouslySent = new Map<string, ICampaignRecipient>();
  for (const r of campaign.recipients ?? []) {
    if (r.status !== "sent") continue;
    previouslySent.set(r.userId?.toString() ?? r.identifier, r);
  }
  const carriedOver = [...previouslySent.values()];

  // Deleted users (users audience only) are already recorded as
  // skipped before the first message goes out.
  const recipients: ICampaignRecipient[] = [...carriedOver];
  let overflow = 0;

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
      audienceUserIds: (campaign.audienceUserIds ?? []).map((uid: mongoose.Types.ObjectId) => uid.toString()),
      channel: "email",
    });

    let users;
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
        const storedIds = (campaign.audienceUserIds ?? []).map((uid: mongoose.Types.ObjectId) =>
          uid.toString()
        );
        users = orderUsersByStoredIds(users, storedIds);
        missingRecipients = findMissingUserIds(
          storedIds,
          users.map((u) => u._id.toString())
        ).map((uid) => ({
          userId: new mongoose.Types.ObjectId(uid),
          identifier: uid,
          status: "skipped" as const,
          error: "User no longer exists",
        }));
      }
    }
    recipients.push(...missingRecipients);

    const subject =
      campaign.channel === "email"
        ? resolveCampaignSubject(campaign.templateType, campaign.subject)
        : undefined;

    const persistProgress = async () => {
      const counts = summarizeRecipients(recipients);
      await CampaignModel.updateOne(
        { _id: campaign._id },
        { $set: { recipients, stats: { ...counts, overflow } } }
      );
      return counts;
    };

    for (let i = 0; i < users.length; i += SEND_BATCH_SIZE) {
      const batch = users.slice(i, i + SEND_BATCH_SIZE);
      const outcomes = await Promise.all(
        batch.map(async (user): Promise<ICampaignRecipient | null> => {
          // Already sent in a previous attempt — carried over, never re-sent.
          if (previouslySent.has(user._id.toString())) return null;

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
              return {
                ...base,
                status: "sent",
                sentAt: new Date(),
                ...(result.messageId ? { providerMessageId: result.messageId } : {}),
              };
            }
            return { ...base, status: "failed", error: (result.error ?? "WhatsApp send failed").slice(0, 500) };
          }

          try {
            const messageId = await sendCampaignEmail(
              user.email,
              subject ?? "",
              renderCampaignEmailHtml(campaign.body, user.name ?? "")
            );
            return {
              ...base,
              status: "sent",
              sentAt: new Date(),
              ...(messageId ? { providerMessageId: messageId } : {}),
            };
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
        if (outcome) recipients.push(outcome);
      }
      // Persist after every batch: a timeout or crash mid-send leaves
      // the progress made so far, not an empty "sending".
      await persistProgress();
    }

    const counts = summarizeRecipients(recipients);
    const stats = { ...counts, overflow };
    await CampaignModel.updateOne(
      { _id: campaign._id },
      { $set: { recipients, stats, status: "sent", sentAt: new Date() } }
    );

    await logAdminAudit({
      req: _req,
      session,
      action: wasFailed ? "campaign.resent" : "campaign.sent",
      description:
        `${wasFailed ? "Re-sent" : "Sent"} campaign "${campaign.name}" (${campaign.channel}): ` +
        `${counts.sent} sent, ${counts.failed} failed, ${counts.skipped} skipped of ${counts.targeted} targeted` +
        (carriedOver.length > 0 ? ` (${carriedOver.length} already sent in a previous attempt, not re-sent)` : "") +
        (overflow > 0 ? ` (${overflow} over the ${CAMPAIGN_AUDIENCE_CAP} cap, not sent)` : ""),
      resourceType: "Campaign",
      resourceId: campaign._id.toString(),
      metadata: { ...counts, overflow, resumed: carriedOver.length, channel: campaign.channel, templateType: campaign.templateType },
    });

    return NextResponse.json({
      success: true,
      id: campaign._id.toString(),
      status: "sent",
      stats,
      overflow,
      resumed: carriedOver.length,
      audienceCap: CAMPAIGN_AUDIENCE_CAP,
    });
  } catch (err) {
    logger.error("campaign send failed", toLogError(err));
    // Save the progress made so far — the per-recipient outcomes are
    // evidence, and the campaign must be re-sendable from them, not
    // left as an empty "sending" or a "failed" with nothing recorded.
    const counts = summarizeRecipients(recipients);
    await CampaignModel.updateOne(
      { _id: campaign._id },
      {
        $set: {
          recipients,
          stats: { ...counts, overflow },
          status: "failed",
          error: (err instanceof Error ? err.message : "Campaign send failed").slice(0, 500),
        },
      }
    ).catch(() => undefined);
    return fail("Campaign send failed partway — check the campaign for per-recipient results", 500, "CAMPAIGN_SEND_FAILED");
  }
}
