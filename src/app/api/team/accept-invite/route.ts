import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import TeamModel, { type ITeamMember } from "@/models/Team";
import UserModel from "@/models/User";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  await connectDB();

  // Find team with this invite token
  const team = await TeamModel.findOne({ "members.inviteToken": token });
  if (!team) return NextResponse.json({ error: "Invite not found", expired: true }, { status: 404 });

  const memberIdx = team.members.findIndex((m: ITeamMember) => m.inviteToken === token);
  const member = team.members[memberIdx];

  if (!member) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  // Check expiry
  if (member.inviteExpires && new Date() > member.inviteExpires) {
    return NextResponse.json({ error: "Invite expired", expired: true }, { status: 410 });
  }

  // Get current session (user must be logged in or create account)
  const session = await auth();
  let userId = (session?.user as { id?: string } | undefined)?.id;

  // If not logged in, check if a user with this email exists
  if (!userId && member.inviteEmail) {
    const user = await UserModel.findOne({ email: member.inviteEmail });
    if (user) userId = user._id.toString();
  }

  if (!userId) {
    // Redirect to register with email pre-filled
    return NextResponse.json({
      error: "Please create an account or sign in first",
      requiresAuth: true,
      email: member.inviteEmail,
    }, { status: 401 });
  }

  // Accept invite
  team.members[memberIdx].status = "active";
  team.members[memberIdx].userId = require("mongoose").Types.ObjectId.createFromHexString(userId);
  team.members[memberIdx].joinedAt = new Date();
  team.members[memberIdx].inviteToken = undefined;
  team.members[memberIdx].inviteExpires = undefined;
  await team.save();

  // Link team to user
  await UserModel.findByIdAndUpdate(userId, { teamId: team._id, role: member.role });

  return NextResponse.json({ success: true, teamName: team.name });
}
