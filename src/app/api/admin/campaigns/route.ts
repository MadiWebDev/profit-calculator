/**
 * GET  /api/admin/campaigns       — paginated list of campaigns (newest first)
 * POST /api/admin/campaigns       — create a draft campaign (does NOT send)
 *
 * superAdmin-only. Sending is a separate step: POST /api/admin/campaigns/[id]/send.
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel from "@/models/Campaign";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { requireSuperAdmin, resolveAdminTeamId } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { parseBody, fail, objectIdString } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import {
  buildAudienceFilter,
  CAMPAIGN_AUDIENCE_CAP,
  computeAudienceEstimate,
  dedupeObjectIdStrings,
  isValidWhatsAppTemplateName,
  resolveAudienceLimit,
} from "@/lib/campaigns";
import { z } from "zod";

const CreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
    channel: z.enum(["email", "whatsapp"]),
    templateType: z.enum([
      "announcement",
      "product_update",
      "trial_ending",
      "billing_notice",
      "feature_launch",
    ]),
    subject: z.string().trim().max(200, "Subject too long").optional(),
    body: z.string().trim().min(1, "Message body is required").max(5000, "Body too long"),
    whatsappTemplateName: z.string().trim().max(512).optional(),
    audienceType: z.enum(["all", "plan", "team", "users", "limited"]),
    audiencePlan: z.enum(["free", "starter", "growth", "pro"]).optional(),
    audienceTeamId: objectIdString("audienceTeamId").optional(),
    audienceUserIds: z
      .array(objectIdString("audienceUserIds"))
      .min(1, "Select at least one user")
      .max(500, "At most 500 users can be selected")
      .optional(),
    audienceLimit: z.number().int().min(1).max(500).default(25),
  })
  .strict();

// ── GET /api/admin/campaigns ──────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

  await connectDB();
  const [campaigns, total] = await Promise.all([
    CampaignModel.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("createdBy", "name email")
      .lean(),
    CampaignModel.countDocuments({}),
  ]);

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      channel: c.channel,
      templateType: c.templateType,
      subject: c.subject ?? null,
      body: c.body,
      whatsappTemplateName: c.whatsappTemplateName ?? null,
      audienceType: c.audienceType,
      audiencePlan: c.audiencePlan ?? null,
      audienceTeamId: c.audienceTeamId?.toString() ?? null,
      audienceUserIds:
        (c.audienceUserIds ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
      audienceLimit: c.audienceLimit ?? null,
      status: c.status,
      stats: c.stats,
      error: c.error ?? null,
      createdBy: c.createdBy
        ? {
            name: (c.createdBy as unknown as { name?: string }).name ?? "",
            email: (c.createdBy as unknown as { email?: string }).email ?? "",
          }
        : null,
      sentAt: c.sentAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    audienceCap: CAMPAIGN_AUDIENCE_CAP,
  });
}

// ── POST /api/admin/campaigns ────────────────────────────────────────────────
// Body: { name, channel, templateType, subject?, body, whatsappTemplateName?,
//         audienceType, audiencePlan?, audienceTeamId?, audienceUserIds?,
//         audienceLimit? }
// Creates a DRAFT only. Response includes the audience estimate so the
// admin sees who will (and will not) receive it before hitting Send.
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "strict", "campaign-create");
  if (rl) return rl;

  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const data = parsed.data;

  if (data.channel === "whatsapp") {
    if (!data.whatsappTemplateName) {
      return fail("whatsappTemplateName is required for WhatsApp campaigns", 400, "TEMPLATE_NAME_REQUIRED");
    }
    if (!isValidWhatsAppTemplateName(data.whatsappTemplateName)) {
      return fail(
        "Invalid WhatsApp template name — use lowercase letters, digits and underscores only (the exact approved name from Meta Business Manager)",
        400,
        "TEMPLATE_NAME_INVALID"
      );
    }
  }
  if (data.audienceType === "plan" && !data.audiencePlan) {
    return fail("audiencePlan is required when audience is by plan", 400, "AUDIENCE_PLAN_REQUIRED");
  }
  if (data.audienceType === "team" && !data.audienceTeamId) {
    return fail("audienceTeamId is required when audience is by team", 400, "AUDIENCE_TEAM_REQUIRED");
  }
  if (data.audienceType === "users" && !data.audienceUserIds?.length) {
    return fail("audienceUserIds is required when audience is specific users", 400, "AUDIENCE_USERS_REQUIRED");
  }

  // De-duplicate the selected users (the create-time count and the
  // stored list both use the de-duplicated set).
  const audienceUserIds =
    data.audienceType === "users" ? dedupeObjectIdStrings(data.audienceUserIds ?? []) : [];
  // Clamp the limit server-side: above 500 it becomes 500, never more.
  const audienceLimit = resolveAudienceLimit(data.audienceLimit);

  try {
    await connectDB();

    if (data.audienceType === "team" && data.audienceTeamId) {
      const team = await TeamModel.findById(data.audienceTeamId).select("_id").lean();
      if (!team) return fail("Team not found", 400, "TEAM_NOT_FOUND");
    }

    if (data.audienceType === "users") {
      // Re-check every selected id against the DB — the client list is
      // never trusted as-is. Reject the create if any selected user
      // does not exist.
      const existing = await UserModel.find({
        _id: { $in: audienceUserIds },
      })
        .select("_id")
        .lean();
      if (existing.length !== audienceUserIds.length) {
        return fail("One or more selected users no longer exist", 400, "AUDIENCE_USER_NOT_FOUND");
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminId = (session.user as any)?.id as string;
    const campaign = await CampaignModel.create({
      name: data.name,
      channel: data.channel,
      templateType: data.templateType,
      subject: data.subject || undefined,
      body: data.body,
      whatsappTemplateName:
        data.channel === "whatsapp" ? data.whatsappTemplateName!.trim() : undefined,
      audienceType: data.audienceType,
      audiencePlan: data.audienceType === "plan" ? data.audiencePlan : undefined,
      audienceTeamId: data.audienceType === "team" ? data.audienceTeamId : undefined,
      audienceUserIds: data.audienceType === "users" ? audienceUserIds : undefined,
      audienceLimit: data.audienceType === "limited" ? audienceLimit : undefined,
      status: "draft",
      createdBy: adminId,
    });

    // Audience estimate (no messages sent yet): matched users, how many
    // have a usable contact for the channel, and whether the cap bites.
    // The "without phone filter" count comes from the same filter with
    // the email channel, which adds no phone condition.
    // "limited" is different: the audience is the N oldest users, so
    // the estimate fetches exactly those N and counts contacts among
    // them instead of counting the whole user base.
    let matched: number;
    let withContact: number;
    if (data.audienceType === "limited") {
      const oldest = await UserModel.find({})
        .sort({ createdAt: 1 })
        .limit(audienceLimit)
        .select("phone")
        .lean();
      matched = oldest.length;
      withContact =
        data.channel === "whatsapp"
          ? oldest.filter((u) => (u.phone ?? "").trim() !== "").length
          : matched;
    } else {
      const baseFilter = buildAudienceFilter({
        audienceType: data.audienceType,
        audiencePlan: data.audiencePlan,
        audienceTeamId: data.audienceTeamId,
        audienceUserIds,
        channel: "email",
      });
      const contactFilter = buildAudienceFilter({
        audienceType: data.audienceType,
        audiencePlan: data.audiencePlan,
        audienceTeamId: data.audienceTeamId,
        audienceUserIds,
        channel: data.channel,
      });
      [matched, withContact] = await Promise.all([
        UserModel.countDocuments(baseFilter),
        UserModel.countDocuments(contactFilter),
      ]);
    }
    const audience = computeAudienceEstimate(matched, withContact);

    const teamId = await resolveAdminTeamId(session);
    if (teamId) {
      await logAudit({
        teamId,
        userId: adminId,
        action: "campaign.created",
        description: `Created campaign draft "${data.name}" (${data.channel}, ${data.audienceType})`,
        resourceType: "Campaign",
        resourceId: campaign._id.toString(),
        metadata: { channel: data.channel, audienceType: data.audienceType, matched, withContact },
      });
    }

    return NextResponse.json(
      {
        success: true,
        id: campaign._id.toString(),
        status: "draft",
        audience,
        audienceCap: CAMPAIGN_AUDIENCE_CAP,
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error("campaign create failed", toLogError(err));
    return fail("Could not create campaign", 500, "CAMPAIGN_CREATE_FAILED");
  }
}
