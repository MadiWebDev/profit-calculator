/**
 * GET /api/admin/campaigns/[id] — one campaign with its per-recipient
 * results (sent / failed with provider error / skipped with reason).
 * superAdmin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel, { type ICampaignRecipient } from "@/models/Campaign";
import { requireSuperAdmin } from "@/lib/admin-auth";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    recipients: (campaign.recipients ?? []).map((r: ICampaignRecipient) => ({
      userId: r.userId?.toString() ?? null,
      identifier: r.identifier,
      status: r.status,
      error: r.error ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
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
