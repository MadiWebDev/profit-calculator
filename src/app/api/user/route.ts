/**
 * PATCH /api/user — update the current user's display name.
 * Email changes are intentionally not allowed (authentication identity risk).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name too long"),
});

export async function PATCH(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { name } = parsed.data;

  await connectDB();
  await UserModel.findByIdAndUpdate(session.userId, { name });

  await logAudit({
    teamId:       new mongoose.Types.ObjectId(session.teamId),
    userId:       new mongoose.Types.ObjectId(session.userId),
    action:       "settings.updated",
    description:  "Updated profile display name",
    resourceType: "User",
    resourceId:   session.userId,
  });

  return NextResponse.json({ success: true, name });
}
