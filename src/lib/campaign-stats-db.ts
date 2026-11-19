/**
 * Campaign Center stats — DATA layer (Phase 3, server-only). The pure
 * helpers live in ./campaign-stats; this module does the three Mongo
 * aggregations and calls them. It imports Mongoose models, so it must
 * NEVER be imported by a client component (the bundler would try to
 * ship mongoose's node built-ins to the browser).
 *
 * - Rows: campaigns in range, anchored on activityAt (sentAt when
 *   sent, createdAt while a draft); archived campaigns excluded.
 * - Recipient days: one bucket per (UTC day, recipient status) from the
 *   recipient subdocuments' sentAt — exact, including resumed sends.
 * - Event days: one bucket per (UTC day, event type) from the Phase 2
 *   webhook log.
 */
import { connectDB } from "@/lib/db";
import CampaignModel from "@/models/Campaign";
import MessageEventModel from "@/models/MessageEvent";
import MessageSuppressionModel from "@/models/MessageSuppression";
import {
  buildDailySeries,
  computeKpis,
  computeChannelBreakdown,
  computeTypeBreakdown,
  computePlanBreakdown,
  type CampaignStatsRow,
  type RecipientDayBucket,
  type EventDayBucket,
  type DateRange,
  type CampaignCenterStats,
} from "./campaign-stats";

export type { CampaignCenterStats };

export async function getCampaignCenterStats(input: {
  range: DateRange;
  channel: "email" | "whatsapp" | null;
}): Promise<CampaignCenterStats> {
  const { range, channel } = input;
  await connectDB();

  const match: Record<string, unknown> = { archived: { $ne: true } };
  if (channel) match.channel = channel;
  const rangeMatch =
    range === null ? {} : { activityAt: { $gte: range.from, $lt: range.to } };

  const rows = (await CampaignModel.aggregate([
    { $match: match },
    { $addFields: { activityAt: { $ifNull: ["$sentAt", "$createdAt"] } } },
    { $match: rangeMatch },
    {
      $project: {
        _id: 0,
        channel: 1,
        templateType: 1,
        audienceType: 1,
        audiencePlan: 1,
        status: 1,
        sentAt: 1,
        createdAt: 1,
        stats: 1,
      },
    },
  ])) as CampaignStatsRow[];

  const recipientDays = (
    range === null
      ? []
      : await CampaignModel.aggregate([
          { $match: match },
          { $unwind: "$recipients" },
          { $match: { "recipients.sentAt": { $gte: range.from, $lt: range.to } } },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$recipients.sentAt",
                    timezone: "UTC",
                  },
                },
                status: "$recipients.status",
              },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, date: "$_id.date", status: "$_id.status", count: 1 } },
        ])
  ) as RecipientDayBucket[];

  const eventDays = (
    range === null
      ? []
      : await MessageEventModel.aggregate([
          {
            $match: {
              occurredAt: { $gte: range.from, $lt: range.to },
              ...(channel ? { channel } : {}),
            },
          },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$occurredAt",
                    timezone: "UTC",
                  },
                },
                eventType: "$eventType",
              },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, date: "$_id.date", eventType: "$_id.eventType", count: 1 } },
        ])
  ) as EventDayBucket[];

  const suppressionFilter: Record<string, unknown> = channel
    ? { channel: { $in: [channel, "all"] } }
    : {};
  const unsubscribed = await MessageSuppressionModel.countDocuments(suppressionFilter);
  const hasTracking = eventDays.some((b) => b.count > 0);

  return {
    kpis: computeKpis(rows, unsubscribed),
    daily: buildDailySeries(range, recipientDays, eventDays),
    byChannel: computeChannelBreakdown(rows),
    byType: computeTypeBreakdown(rows),
    byPlan: computePlanBreakdown(rows),
    hasTracking,
  };
}
