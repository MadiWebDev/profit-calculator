import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import TeamModel, { type ITeamMember } from "@/models/Team";
import UserModel from "@/models/User";
import { sendTeamInviteEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { randomBytes } from "crypto";
import mongoose from "mongoose";

/**
 * POST /api/team/invite
 * Reserved endpoint — only the workspace owner can call this.
 * In the current single-owner model this is unused from the UI,
 * but kept for future multi-seat plans.
 */
export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  if (session.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can send invites" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  await connectDB();

  const team = await TeamModel.findById(session.teamId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // Check if already a member
  const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
  if (existingUser && team.members.some((m: ITeamMember) => m.userId?.toString() === existingUser._id.toString())) {
    return NextResponse.json({ error: "This user is already a member" }, { status: 409 });
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  team.members.push({
    userId:        existingUser?._id ?? new mongoose.Types.ObjectId(),
    role:          "owner",
    invitedAt:     new Date(),
    inviteEmail:   email.toLowerCase(),
    inviteToken:   token,
    inviteExpires: expires,
    status:        "pending",
  });
  await team.save();

  const inviterUser = await UserModel.findById(session.userId).lean();
  await sendTeamInviteEmail(email, inviterUser?.name ?? "Your teammate", team.name, token);

  await logAudit({
    teamId: new mongoose.Types.ObjectId(session.teamId),
    userId: new mongoose.Types.ObjectId(session.userId),
    action: "user.invited",
    description: `Invited ${email}`,
    metadata: { email },
  });

  return NextResponse.json({ success: true, token });
}
