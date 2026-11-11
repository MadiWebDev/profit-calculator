/**
 * GET /api/admin/campaigns/last-message?userIds=<id,id,...>
 * — the most recent campaign message per requested user, for the admin
 * user directory ("last message sent to this user").
 *
 * superAdmin-only. One aggregation over Campaign.recipients for the
 * whole page of users — never one query per user. At most 100 ids.
 *
 * A recipient only exists on a campaign that was actually sent, so the
 * match implicitly covers sent campaigns only. The date is the
 * campaign's sentAt, falling back to the recipient's sentAt.
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel from "@/models/Campaign";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { buildLastMessageMap, type LastMessageRow } from "@/lib/campaigns";

const MAX_USER_IDS = 100;

export async function GET(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const raw = new URL(req.url).searchParams.get("userIds") ?? "";
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && mongoose.Types.ObjectId.isValid(id))
    .slice(0, MAX_USER_IDS);
  if (ids.length === 0) {
    return NextResponse.json({ error: "userIds query parameter is required" }, { status: 400 });
  }
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  await connectDB();
  const rows = await CampaignModel.aggregate([
    { $match: { status: "sent", "recipients.userId": { $in: objectIds } } },
    { $unwind: "$recipients" },
    { $match: { "recipients.userId": { $in: objectIds } } },
    { $sort: { sentAt: -1, "recipients.sentAt": -1 } },
    {
      $group: {
        _id: "$recipients.userId",
        campaignId: { $first: "$_id" },
        campaignName: { $first: "$name" },
        channel: { $first: "$channel" },
        status: { $first: "$recipients.status" },
        sentAt: { $first: "$sentAt" },
        recipientSentAt: { $first: "$recipients.sentAt" },
      },
    },
  ]);

  const normalized: LastMessageRow[] = rows.map(
    (r: {
      _id: mongoose.Types.ObjectId;
      campaignId: mongoose.Types.ObjectId;
      campaignName: string;
      channel: "email" | "whatsapp";
      status: "sent" | "failed" | "skipped";
      sentAt?: Date;
      recipientSentAt?: Date;
    }) => ({
      userId: r._id.toString(),
      campaignId: r.campaignId.toString(),
      campaignName: r.campaignName,
      channel: r.channel,
      status: r.status,
      sentAt: (r.sentAt ?? r.recipientSentAt)?.toISOString() ?? null,
    })
  );

  return NextResponse.json({ lastMessages: buildLastMessageMap(normalized) });
}
