import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import TeamModel, { type ITeamMember } from "@/models/Team";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

// GET — list all members
export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  await connectDB();
  const team = await TeamModel.findById(session.teamId)
    .populate("members.userId", "name email image")
    .lean();
  if (!team) return NextResponse.json({ members: [] });

  return NextResponse.json({
    members: team.members.map((m: ITeamMember) => {
      const u = m.userId as { name?: string; email?: string; image?: string; _id?: unknown } | null;
      return {
        userId:      (u?._id ?? m.userId)?.toString(),
        name:        u?.name ?? null,
        email:       u?.email ?? m.inviteEmail,
        image:       u?.image ?? null,
        role:        m.role,
        status:      m.status,
        invitedAt:   m.invitedAt?.toISOString(),
        joinedAt:    m.joinedAt?.toISOString(),
        inviteEmail: m.inviteEmail,
      };
    }),
  });
}

// PATCH — change role
export async function PATCH(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  if (!["owner", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: "userId and role required" }, { status: 400 });
  if (!["admin", "member", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (userId === session.userId) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  await connectDB();
  const team = await TeamModel.findById(session.teamId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const member = team.members.find((m: ITeamMember) => m.userId?.toString() === userId);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (member.role === "owner") return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });

  const oldRole = member.role;
  member.role = role;
  await team.save();

  await logAudit({
    teamId: new mongoose.Types.ObjectId(session.teamId),
    userId: new mongoose.Types.ObjectId(session.userId),
    action: "user.role_changed",
    description: `Changed role of user ${userId} from ${oldRole} to ${role}`,
    metadata: { targetUserId: userId, oldRole, newRole: role },
  });

  return NextResponse.json({ success: true });
}

// DELETE — remove member
export async function DELETE(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  if (!["owner", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (userId === session.userId) return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });

  await connectDB();
  const team = await TeamModel.findById(session.teamId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const idx = team.members.findIndex((m: ITeamMember) => m.userId?.toString() === userId);
  if (idx === -1) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (team.members[idx].role === "owner") return NextResponse.json({ error: "Cannot remove the owner" }, { status: 400 });

  team.members.splice(idx, 1);
  await team.save();

  await logAudit({
    teamId: new mongoose.Types.ObjectId(session.teamId),
    userId: new mongoose.Types.ObjectId(session.userId),
    action: "user.removed",
    description: `Removed member ${userId} from team`,
    metadata: { removedUserId: userId },
  });

  return NextResponse.json({ success: true });
}
