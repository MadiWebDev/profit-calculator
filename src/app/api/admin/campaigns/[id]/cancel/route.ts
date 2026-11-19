/**
 * POST /api/admin/campaigns/[id]/cancel — recover a campaign stranded
 * in "sending".
 *
 * superAdmin-only. A send runs synchronously inside one request, so a
 * platform timeout or crash mid-send can leave the campaign at status
 * "sending" forever, with no endpoint able to move it. This route flips
 * a "sending" campaign to "failed" (atomically — only "sending" can be
 * cancelled), preserving whatever per-recipient progress was already
 * persisted, so the admin can re-send it from that progress (the send
 * route resumes: recipients already recorded as "sent" are carried
 * over, never re-sent).
 *
 * Cancelling is a deliberate admin act and is audit-logged as
 * "campaign.cancelled". It never unsends messages that already went
 * out — the description says exactly how many recipients were already
 * processed.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel from "@/models/Campaign";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/validation";
import { logAdminAudit } from "@/lib/audit";
import { summarizeRecipients } from "@/lib/campaigns";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(_req, "strict", `campaign-cancel:${adminId}`);
  if (rl) return rl;

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  await connectDB();
  const campaign = await CampaignModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(id), status: "sending" },
    {
      $set: {
        status: "failed",
        error: "Send cancelled by admin before completion",
      },
    },
    { new: true }
  );
  if (!campaign) {
    const existing = await CampaignModel.findById(id).select("status").lean();
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return fail(`Campaign is ${existing.status} and cannot be cancelled`, 409, "CAMPAIGN_NOT_SENDING");
  }

  const counts = summarizeRecipients(campaign.recipients ?? []);
  await logAdminAudit({
    req: _req,
    session,
    action: "campaign.cancelled",
    description:
      `Cancelled campaign "${campaign.name}" (${campaign.channel}) while sending: ` +
      `${counts.sent} of ${counts.targeted} recipients were already processed and are kept on the campaign; ` +
      `re-sending will resume from that progress, not re-blast them.`,
    resourceType: "Campaign",
    resourceId: campaign._id.toString(),
    metadata: { ...counts, channel: campaign.channel },
  });

  return NextResponse.json({
    success: true,
    id: campaign._id.toString(),
    status: "failed",
    stats: { ...counts, overflow: campaign.stats?.overflow ?? 0 },
  });
}
