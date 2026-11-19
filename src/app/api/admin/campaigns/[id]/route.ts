/**
 * GET /api/admin/campaigns/[id] — one campaign with its per-recipient
 * results (sent / failed with provider error / skipped with reason).
 * PATCH — edit a DRAFT only (Phase 3). DELETE — delete a DRAFT or an
 * archived campaign only (Phase 3). superAdmin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel, { type ICampaignRecipient } from "@/models/Campaign";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { parseBody, fail, objectIdString } from "@/lib/validation";
import { logAdminAudit } from "@/lib/audit";
import { isValidWhatsAppTemplateName } from "@/lib/campaigns";
import { z } from "zod";

// Editable draft fields — same bounds as the create schema, all optional.
const EditSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name too long").optional(),
    channel: z.enum(["email", "whatsapp"]).optional(),
    templateType: z
      .enum(["announcement", "product_update", "trial_ending", "billing_notice", "feature_launch"])
      .optional(),
    subject: z.string().trim().max(200, "Subject too long").optional(),
    body: z.string().trim().min(1, "Message body is required").max(5000, "Body too long").optional(),
    whatsappTemplateName: z.string().trim().max(512).optional(),
    audienceType: z.enum(["all", "plan", "team", "users", "limited"]).optional(),
    audiencePlan: z.enum(["free", "starter", "growth", "pro"]).optional(),
    audienceTeamId: objectIdString("audienceTeamId").optional(),
    audienceUserIds: z
      .array(objectIdString("audienceUserIds"))
      .min(1, "Select at least one user")
      .max(500, "At most 500 users can be selected")
      .optional(),
    audienceLimit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(_req, "standard", `campaign-detail:${adminId}`);
  if (rl) return rl;

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  await connectDB();
  const campaign = await CampaignModel.findById(id)
    .populate("createdBy", "name email")
    .lean();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  return NextResponse.json({
    id: campaign._id.toString(),
    name: campaign.name,
    channel: campaign.channel,
    templateType: campaign.templateType,
    subject: campaign.subject ?? null,
    body: campaign.body,
    whatsappTemplateName: campaign.whatsappTemplateName ?? null,
    audienceType: campaign.audienceType,
    audiencePlan: campaign.audiencePlan ?? null,
    audienceTeamId: campaign.audienceTeamId?.toString() ?? null,
    audienceUserIds: (campaign.audienceUserIds ?? []).map((id: mongoose.Types.ObjectId) =>
      id.toString()
    ),
    audienceLimit: campaign.audienceLimit ?? null,
    status: campaign.status,
    stats: campaign.stats,
    error: campaign.error ?? null,
    archived: campaign.archived ?? false,
    archivedAt: campaign.archivedAt?.toISOString() ?? null,
    recipients: (campaign.recipients ?? []).map((r: ICampaignRecipient) => ({
      userId: r.userId?.toString() ?? null,
      identifier: r.identifier,
      status: r.status,
      error: r.error ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      providerMessageId: r.providerMessageId ?? null,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      openedAt: r.openedAt?.toISOString() ?? null,
      clickedAt: r.clickedAt?.toISOString() ?? null,
      readAt: r.readAt?.toISOString() ?? null,
      failedAt: r.failedAt?.toISOString() ?? null,
    })),
    createdBy: campaign.createdBy
      ? {
          name: (campaign.createdBy as unknown as { name?: string }).name ?? "",
          email: (campaign.createdBy as unknown as { email?: string }).email ?? "",
        }
      : null,
    sentAt: campaign.sentAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "standard", `campaign-edit:${adminId}`);
  if (rl) return rl;

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const parsed = await parseBody(req, EditSchema);
  if ("response" in parsed) return parsed.response;
  const data = parsed.data;

  await connectDB();
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return fail(`Only a draft can be edited (campaign is ${campaign.status})`, 409, "CAMPAIGN_NOT_DRAFT");
  }

  // Merge, then validate the resulting channel's requirements: a
  // WhatsApp draft needs a valid Meta template name; an email draft
  // keeps its subject and drops the template name.
  const nextChannel = data.channel ?? campaign.channel;
  const nextTemplateName = data.whatsappTemplateName ?? campaign.whatsappTemplateName;
  if (nextChannel === "whatsapp") {
    if (!nextTemplateName || !isValidWhatsAppTemplateName(nextTemplateName)) {
      return NextResponse.json(
        { error: "A WhatsApp campaign needs a valid Meta-approved template name" },
        { status: 400 }
      );
    }
  }

  const update: Record<string, unknown> = {};
  for (const key of [
    "name", "channel", "templateType", "subject", "body",
    "whatsappTemplateName", "audienceType", "audiencePlan",
    "audienceTeamId", "audienceUserIds", "audienceLimit",
  ] as const) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  // Channel-specific fields that no longer apply are removed, not left
  // stale: an email draft carries no template name, a WhatsApp draft
  // carries no subject. ($unset is built conditionally — an undefined
  // value inside it would reach the driver.)
  const unset: Record<string, ""> = {};
  if (nextChannel === "email") unset.whatsappTemplateName = "";
  if (nextChannel === "whatsapp") unset.subject = "";
  const updateDoc: Record<string, unknown> = { $set: update };
  if (Object.keys(unset).length > 0) updateDoc.$unset = unset;
  // An audience change to "users" needs users; to "team" needs a team.
  const nextAudience = data.audienceType ?? campaign.audienceType;
  if (nextAudience === "users" && (data.audienceUserIds ?? campaign.audienceUserIds ?? []).length === 0) {
    return NextResponse.json({ error: "Select at least one user" }, { status: 400 });
  }
  if (nextAudience === "team" && !(data.audienceTeamId ?? campaign.audienceTeamId)) {
    return NextResponse.json({ error: "Select a team" }, { status: 400 });
  }

  const updated = await CampaignModel.findByIdAndUpdate(id, updateDoc, { new: true }).lean();
  if (!updated) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  await logAdminAudit({
    req,
    session,
    action: "campaign.edited",
    description: `Edited draft campaign "${updated.name}" (${updated.channel}).`,
    resourceType: "Campaign",
    resourceId: updated._id.toString(),
    metadata: { channel: updated.channel, fields: Object.keys(update) },
  });

  return NextResponse.json({ id: updated._id.toString(), name: updated.name, status: updated.status });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "standard", `campaign-delete:${adminId}`);
  if (rl) return rl;

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  await connectDB();
  const campaign = await CampaignModel.findById(id).select("name channel status archived").lean();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  // Sent history is evidence: only drafts and archived campaigns may
  // be deleted. A sent/failed/sending campaign is archived instead.
  const deletable = campaign.status === "draft" || campaign.archived === true;
  if (!deletable) {
    return fail(
      `A ${campaign.status} campaign cannot be deleted — archive it instead`,
      409,
      "CAMPAIGN_NOT_DELETABLE"
    );
  }
  await CampaignModel.deleteOne({ _id: campaign._id });

  await logAdminAudit({
    req,
    session,
    action: "campaign.deleted",
    description: `Deleted ${campaign.status} campaign "${campaign.name}" (${campaign.channel}).`,
    resourceType: "Campaign",
    resourceId: campaign._id.toString(),
    metadata: { channel: campaign.channel, status: campaign.status },
  });

  return NextResponse.json({ success: true, id: campaign._id.toString() });
}
