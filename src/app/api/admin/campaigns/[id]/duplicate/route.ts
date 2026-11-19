/**
 * POST /api/admin/campaigns/[id]/duplicate — copy a campaign as a new
 * draft (Phase 3). The copy keeps the channel, template, message, and
 * audience of the original; it gets a fresh name ("Copy of …"), empty
 * stats/recipients, and status "draft" — nothing is ever re-sent by
 * duplicating. A campaign stranded in "sending" cannot be duplicated
 * (its send is still in flight); cancel it first.
 *
 * superAdmin-only. Audit-logged as "campaign.duplicated".
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel from "@/models/Campaign";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/validation";
import { logAdminAudit } from "@/lib/audit";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(_req, "strict", `campaign-duplicate:${adminId}`);
  if (rl) return rl;

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  await connectDB();
  const original = await CampaignModel.findById(id).lean();
  if (!original) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (original.status === "sending") {
    return fail("A campaign that is still sending cannot be duplicated", 409, "CAMPAIGN_SENDING");
  }

  const copy = await CampaignModel.create({
    name: `Copy of ${original.name}`.slice(0, 100),
    channel: original.channel,
    templateType: original.templateType,
    subject: original.subject ?? undefined,
    body: original.body,
    whatsappTemplateName: original.whatsappTemplateName ?? undefined,
    audienceType: original.audienceType,
    audiencePlan: original.audiencePlan ?? undefined,
    audienceTeamId: original.audienceTeamId ?? undefined,
    audienceUserIds: original.audienceUserIds ?? [],
    audienceLimit: original.audienceLimit ?? undefined,
    status: "draft",
    createdBy: new mongoose.Types.ObjectId(adminId),
    stats: {
      targeted: 0, sent: 0, failed: 0, skipped: 0, overflow: 0,
      delivered: 0, opened: 0, clicked: 0, bounced: 0,
      complained: 0, read: 0, suppressed: 0,
    },
    recipients: [],
  });

  await logAdminAudit({
    req: _req,
    session,
    action: "campaign.duplicated",
    description: `Duplicated campaign "${original.name}" (${original.channel}) as draft "${copy.name}".`,
    resourceType: "Campaign",
    resourceId: copy._id.toString(),
    metadata: { sourceCampaignId: original._id.toString(), channel: original.channel },
  });

  return NextResponse.json(
    { id: copy._id.toString(), name: copy.name, status: "draft" },
    { status: 201 }
  );
}
