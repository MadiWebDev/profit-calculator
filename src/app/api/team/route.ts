/**
 * PATCH /api/team — update workspace settings (name, currency, timezone).
 * Owner/admin only.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import TeamModel from "@/models/Team";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";
import { z } from "zod";

// IANA timezone list is huge — we accept any non-empty string and let the client
// validate against its own picker. The DB stores whatever the user selects.
const UpdateSchema = z.object({
  name:     z.string().trim().min(1).max(80).optional(),
  currency: z.string().length(3, "Currency must be a 3-letter ISO code").toUpperCase().optional(),
  timezone: z.string().min(1).max(60).optional(),
});

export async function PATCH(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update workspace settings" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await connectDB();
  const team = await TeamModel.findOneAndUpdate(
    { _id: session.teamId },
    { $set: updates },
    { new: true }
  ).select("name currency timezone").lean();

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  await logAudit({
    teamId:       new mongoose.Types.ObjectId(session.teamId),
    userId:       new mongoose.Types.ObjectId(session.userId),
    action:       "settings.updated",
    description:  `Updated workspace settings: ${Object.keys(updates).join(", ")}`,
    resourceType: "Team",
    resourceId:   session.teamId,
  });

  return NextResponse.json({ success: true, team });
}
