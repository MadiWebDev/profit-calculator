/**
 * GET  /api/settings/notifications — load team notification preferences
 * PATCH /api/settings/notifications — save team notification preferences
 *
 * Preferences live on Team.notifPrefs (added to schema below via $set).
 * Slack webhook URL is stored AES-encrypted using the same encryption key.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import TeamModel from "@/models/Team";
import { logAudit } from "@/lib/audit";
import { encrypt, decrypt } from "@/lib/encryption";
import mongoose from "mongoose";
import { z } from "zod";

const PrefsSchema = z.object({
  email_goal_behind:  z.boolean().optional(),
  email_margin_drop:  z.boolean().optional(),
  email_sync_error:   z.boolean().optional(),
  slack_goal_behind:  z.boolean().optional(),
  slack_margin_drop:  z.boolean().optional(),
  slackWebhookUrl:    z.string().url("Invalid Slack webhook URL").optional().or(z.literal("")),
});

export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  await connectDB();
  const team = await TeamModel.findById(session.teamId).select("notifPrefs").lean();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (team as any).notifPrefs ?? {};

  // Decrypt webhook URL for display (show only if present)
  let slackWebhookUrl = "";
  if (raw.slackWebhookUrlEncrypted) {
    try { slackWebhookUrl = decrypt(raw.slackWebhookUrlEncrypted); } catch { /* ignore */ }
  }

  return NextResponse.json({
    email_goal_behind: raw.email_goal_behind ?? true,
    email_margin_drop: raw.email_margin_drop ?? true,
    email_sync_error:  raw.email_sync_error  ?? true,
    slack_goal_behind: raw.slack_goal_behind ?? false,
    slack_margin_drop: raw.slack_margin_drop ?? false,
    slackWebhookUrl,
  });
}

export async function PATCH(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  // Only owner/admin can change notification settings
  if (session.role === "member" || session.role === "viewer") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = PrefsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { slackWebhookUrl, ...boolPrefs } = parsed.data;

  // Build the update — encrypt webhook URL if provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  for (const [k, v] of Object.entries(boolPrefs)) {
    if (v !== undefined) update[`notifPrefs.${k}`] = v;
  }
  if (slackWebhookUrl !== undefined) {
    update["notifPrefs.slackWebhookUrlEncrypted"] =
      slackWebhookUrl ? encrypt(slackWebhookUrl) : "";
  }

  await connectDB();
  await TeamModel.findByIdAndUpdate(session.teamId, { $set: update });

  await logAudit({
    teamId:       new mongoose.Types.ObjectId(session.teamId),
    userId:       new mongoose.Types.ObjectId(session.userId),
    action:       "settings.updated",
    description:  "Updated notification preferences",
    resourceType: "Team",
    resourceId:   session.teamId,
  });

  return NextResponse.json({ success: true });
}
