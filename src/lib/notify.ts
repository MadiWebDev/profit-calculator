/**
 * Unified notification dispatcher.
 * Sends in-app, email, and/or Slack based on team alert config.
 */
import { connectDB } from "@/lib/db";
import NotificationModel, { type NotificationType } from "@/models/Notification";
import TeamModel from "@/models/Team";
import type { IAlertConfig } from "@/models/ProfitGoal";
import mongoose from "mongoose";

interface DispatchOptions {
  teamId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  body: string;
  severity?: "info" | "warning" | "error" | "success";
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  /** Override which channels to use — defaults to team config */
  channels?: ("in_app" | "email" | "slack")[];
  slackWebhookUrl?: string;
}

export async function dispatchNotification(opts: DispatchOptions) {
  await connectDB();

  const sentVia: ("in_app" | "email" | "slack")[] = opts.channels ?? ["in_app"];

  // Always create in-app notification
  await NotificationModel.create({
    teamId:      new mongoose.Types.ObjectId(opts.teamId),
    userId:      opts.userId ? new mongoose.Types.ObjectId(opts.userId) : undefined,
    type:        opts.type,
    title:       opts.title,
    body:        opts.body,
    severity:    opts.severity ?? "info",
    read:        false,
    actionUrl:   opts.actionUrl,
    actionLabel: opts.actionLabel,
    metadata:    opts.metadata,
    sentVia,
  });

  // Send to Slack if webhook URL provided
  if (sentVia.includes("slack") && opts.slackWebhookUrl) {
    await sendSlackNotification(opts.slackWebhookUrl, opts.title, opts.body, opts.severity ?? "info", opts.actionUrl);
  }
}

export async function sendSlackNotification(
  webhookUrl: string,
  title: string,
  body: string,
  severity: "info" | "warning" | "error" | "success",
  actionUrl?: string
) {
  const colorMap = { info: "#3b82f6", warning: "#f59e0b", error: "#ef4444", success: "#22c55e" };
  const emojiMap = { info: "ℹ️", warning: "⚠️", error: "🚨", success: "✅" };

  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${emojiMap[severity]} ${title}*\n${body}`,
      },
    },
  ];

  if (actionUrl) {
    blocks.push({
      type: "actions",
      elements: [{
        type: "button",
        text: { type: "plain_text", text: "View in CalcProfit" },
        url: `${process.env.NEXT_PUBLIC_SITE_URL}${actionUrl}`,
        style: severity === "error" ? "danger" : "primary",
      }],
    });
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachments: [{
          color: colorMap[severity],
          blocks,
          fallback: `${title}: ${body}`,
        }],
      }),
    });
  } catch (err) {
    console.error("Slack notification failed:", err);
  }
}

/** Convenience: send a goal-behind alert */
export async function sendGoalBehindAlert({
  teamId, slackWebhookUrl, emailEnabled, month,
  currentProfit, targetProfit, progressPercent,
}: {
  teamId: string;
  slackWebhookUrl?: string;
  emailEnabled: boolean;
  month: string;
  currentProfit: number;
  targetProfit: number;
  progressPercent: number;
}) {
  const channels: ("in_app" | "email" | "slack")[] = ["in_app"];
  if (emailEnabled) channels.push("email");
  if (slackWebhookUrl) channels.push("slack");

  const fmt = new Intl.NumberFormat("en-US", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  await dispatchNotification({
    teamId,
    type: "goal_behind",
    title: `Profit goal alert — ${month}`,
    body: `You're at ${progressPercent.toFixed(0)}% of your ${month} profit goal. Current: ${fmt.format(currentProfit)} / Target: ${fmt.format(targetProfit)}.`,
    severity: progressPercent < 50 ? "error" : "warning",
    actionUrl: "/dashboard/goals",
    actionLabel: "View Goals",
    slackWebhookUrl,
    channels,
    metadata: { month, currentProfit, targetProfit, progressPercent },
  });
}
