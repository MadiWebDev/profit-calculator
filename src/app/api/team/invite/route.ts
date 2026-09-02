import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import TeamModel, { type ITeamMember } from "@/models/Team";
import UserModel from "@/models/User";
import { sendTeamInviteEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { randomBytes } from "crypto";
import mongoose from "mongoose";

export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  if (!["owner", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Only owners and admins can invite members" }, { status: 403 });
  }

  const { email, role = "member" } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!["admin", "member", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await connectDB();

  const team = await TeamModel.findById(session.teamId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // Check plan limits
  const { PLAN_LIMITS } = await import("@/lib/plans");
  const limits = PLAN_LIMITS[team.plan as keyof typeof PLAN_LIMITS];
  const activeMembers = team.members.filter((m: ITeamMember) => m.status === "active").length;
  if (limits.teamMembers !== -1 && activeMembers >= limits.teamMembers) {
    return NextResponse.json(
      { error: `Your ${team.plan} plan supports up to ${limits.teamMembers} team members. Upgrade to add more.` },
      { status: 403 }
    );
  }

  // Check if already a member
  const alreadyMember = team.members.some(
    (m: ITeamMember) => m.inviteEmail === email.toLowerCase() || m.status === "active"
  );
  const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
  if (existingUser && team.members.some((m: ITeamMember) => m.userId?.toString() === existingUser._id.toString())) {
    return NextResponse.json({ error: "This user is already a team member" }, { status: 409 });
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  team.members.push({
    userId:        existingUser?._id ?? new mongoose.Types.ObjectId(),
    role:          role as "admin" | "member" | "viewer",
    invitedAt:     new Date(),
    inviteEmail:   email.toLowerCase(),
    inviteToken:   token,
    inviteExpires: expires,
    status:        "pending",
  });
  await team.save();

  // Send invite email
  const inviterUser = await UserModel.findById(session.userId).lean();
  await sendTeamInviteEmail(email, inviterUser?.name ?? "Your teammate", team.name, token);

  await logAudit({
    teamId: new mongoose.Types.ObjectId(session.teamId),
    userId: new mongoose.Types.ObjectId(session.userId),
    action: "user.invited",
    description: `Invited ${email} as ${role}`,
    metadata: { email, role },
  });

  return NextResponse.json({ success: true, token });
}
