import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { lastOwnerGuard } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import TeamModel, { type ITeamMember, type TeamRole } from "@/models/Team";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";

const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const;

const UpdateRoleSchema = z
  .object({
    userId: z.string().min(1).max(64),
    role: z.enum(TEAM_ROLES),
  })
  .strict();

const TransferSchema = z
  .object({ newOwnerUserId: z.string().min(1).max(64) })
  .strict();

type PopulatedMember = ITeamMember & {
  userId: { name?: string; email?: string; image?: string; _id?: unknown } | null;
};

function serialize(m: PopulatedMember) {
  const u = m.userId;
  const id = (u?._id ?? (m as unknown as { userId?: unknown }).userId)?.toString?.() ?? "";
  return {
    userId: id,
    name: u?.name ?? null,
    email: u?.email ?? m.inviteEmail ?? null,
    image: u?.image ?? null,
    role: m.role,
    status: m.status,
    invitedAt: m.invitedAt,
    joinedAt: m.joinedAt,
  };
}

/**
 * GET /api/team/members — list members (any active member).
 */
export async function GET(req: Request) {
  const authed = await requireAuth(req);
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  await connectDB();
  const team = await TeamModel.findById(toObjectId(session.teamId))
    .populate("members.userId", "name email image")
    .lean();
  if (!team) return NextResponse.json({ members: [] });

  return NextResponse.json({
    members: (team.members as unknown as PopulatedMember[]).map(serialize),
    currentUserId: session.userId,
    currentRole: session.teamRole,
  });
}

/**
 * PATCH /api/team/members — change a member's role (manage:team).
 * Blocked when it would leave zero active owners.
 */
export async function PATCH(req: Request) {
  const authed = await requireAuth(req, { permission: "manage:team" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, UpdateRoleSchema);
  if ("response" in parsed) return parsed.response;
  const { userId, role } = parsed.data;

  await connectDB();
  const team = await TeamModel.findById(toObjectId(session.teamId));
  if (!team) return fail("Team not found", 404, "TEAM_NOT_FOUND");

  const member = team.members.find((m: ITeamMember) => m.userId?.toString() === userId);
  if (!member || member.status !== "active") {
    return fail("Member not found", 404, "MEMBER_NOT_FOUND");
  }

  // Only owners can grant/revoke the owner role
  if ((role === "owner" || member.role === "owner") && session.teamRole !== "owner") {
    return fail("Only an owner can change owner roles", 403, "FORBIDDEN");
  }

  // Last-owner guard on downgrade
  if (member.role === "owner" && role !== "owner") {
    const blocked = await lastOwnerGuard(session.teamId, userId);
    if (blocked) return fail(blocked, 409, "LAST_OWNER");
  }

  const oldRole: TeamRole = member.role;
  member.role = role as TeamRole;
  await team.save();

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "user.role_changed",
      description: `Changed member role: ${oldRole} → ${role}`,
      resourceType: "Team",
      resourceId: session.teamId,
      metadata: { targetUserId: userId, oldRole, newRole: role },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ success: true, userId, role });
}

/**
 * DELETE /api/team/members?userId=… — remove a member (manage:team).
 * Blocked for the last active owner; members cannot remove themselves
 * (transfer ownership first).
 */
export async function DELETE(req: Request) {
  const authed = await requireAuth(req, { permission: "manage:team" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return fail("userId query param required", 400, "VALIDATION_ERROR");
  if (userId === session.userId) {
    return fail("You cannot remove yourself — transfer ownership first", 400, "CANNOT_REMOVE_SELF");
  }

  await connectDB();
  const team = await TeamModel.findById(toObjectId(session.teamId));
  if (!team) return fail("Team not found", 404, "TEAM_NOT_FOUND");

  const idx = team.members.findIndex((m: ITeamMember) => m.userId?.toString() === userId);
  if (idx === -1) return fail("Member not found", 404, "MEMBER_NOT_FOUND");

  const blocked = await lastOwnerGuard(session.teamId, userId);
  if (blocked) return fail(blocked, 409, "LAST_OWNER");

  const removedRole = team.members[idx].role;
  team.members.splice(idx, 1);
  await team.save();

  // Detach the user's team link
  const { default: UserModel } = await import("@/models/User");
  await UserModel.findByIdAndUpdate(toObjectId(userId), { $unset: { teamId: "" } });

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "user.removed",
      description: `Removed member (${removedRole})`,
      resourceType: "Team",
      resourceId: session.teamId,
      metadata: { removedUserId: userId, removedRole },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ success: true });
}

/**
 * POST /api/team/members — transfer ownership (owner only).
 * Body: { newOwnerUserId }. The current owner becomes an admin.
 */
export async function POST(req: Request) {
  const authed = await requireAuth(req, { permission: "manage:team" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  if (session.teamRole !== "owner") {
    return fail("Only the owner can transfer ownership", 403, "FORBIDDEN");
  }

  const parsed = await parseBody(req, TransferSchema);
  if ("response" in parsed) return parsed.response;
  const { newOwnerUserId } = parsed.data;

  if (newOwnerUserId === session.userId) {
    return fail("You are already the owner", 400, "VALIDATION_ERROR");
  }

  await connectDB();
  const team = await TeamModel.findById(toObjectId(session.teamId));
  if (!team) return fail("Team not found", 404, "TEAM_NOT_FOUND");

  const current = team.members.find((m: ITeamMember) => m.userId?.toString() === session.userId);
  const next = team.members.find((m: ITeamMember) => m.userId?.toString() === newOwnerUserId);
  if (!current || !next || next.status !== "active") {
    return fail("New owner must be an active member", 404, "MEMBER_NOT_FOUND");
  }

  current.role = "admin";
  next.role = "owner";
  team.ownerId = toObjectId(newOwnerUserId);
  await team.save();

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "team.ownership_transferred",
      description: "Transferred workspace ownership",
      resourceType: "Team",
      resourceId: session.teamId,
      metadata: { newOwnerUserId },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ success: true, newOwnerUserId });
}
