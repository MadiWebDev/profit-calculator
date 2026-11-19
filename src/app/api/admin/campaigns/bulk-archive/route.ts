/**
 * POST /api/admin/campaigns/bulk-archive — archive or unarchive several
 * campaigns at once (Phase 3). Archiving hides a campaign from the
 * default list without deleting its records or delivery history; a
 * campaign stranded in "sending" is skipped (cancel it first — its send
 * is still in flight). Unarchiving restores it to the list.
 *
 * superAdmin-only. Audit-logged once per call as
 * "campaign.bulk_archived" with the counts, not once per campaign.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel from "@/models/Campaign";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { parseBody, objectIdString } from "@/lib/validation";
import { logAdminAudit } from "@/lib/audit";
import { z } from "zod";

const BulkArchiveSchema = z
  .object({
    ids: z.array(objectIdString("ids")).min(1).max(100),
    archived: z.boolean(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "strict", `campaign-bulk-archive:${adminId}`);
  if (rl) return rl;

  const parsed = await parseBody(req, BulkArchiveSchema);
  if ("response" in parsed) return parsed.response;
  const data = parsed.data;

  await connectDB();
  const ids = data.ids.map((id) => new mongoose.Types.ObjectId(id));
  const result = await CampaignModel.updateMany(
    { _id: { $in: ids }, status: { $ne: "sending" } },
    data.archived
      ? { $set: { archived: true, archivedAt: new Date() } }
      : { $set: { archived: false }, $unset: { archivedAt: "" } }
  );
  const skipped = ids.length - result.modifiedCount;

  await logAdminAudit({
    req,
    session,
    action: "campaign.bulk_archived",
    description: data.archived
      ? `Archived ${result.modifiedCount} campaign${result.modifiedCount === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped — still sending)` : ""}.`
      : `Unarchived ${result.modifiedCount} campaign${result.modifiedCount === 1 ? "" : "s"}.`,
    resourceType: "Campaign",
    metadata: { archived: data.archived, updated: result.modifiedCount, skipped },
  });

  return NextResponse.json({
    success: true,
    updated: result.modifiedCount,
    skipped,
  });
}
