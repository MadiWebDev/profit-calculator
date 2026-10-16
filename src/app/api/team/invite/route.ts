import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import TeamModel, { type ITeamMember, type TeamRole } from "@/models/Team";
import UserModel from "@/models/User";
import { sendTeamInviteEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import mongoose from "mongoose";

const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

const InviteBodySchema = z
  .object({
    email: z.email().max(254).transform((s) => s.toLowerCase()),
    role: z.enum(["admin", "member", "viewer"]).default("member"),
    resend: z.boolean().optional(),
  })
  .strict();

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * POST /api/team/invite — invite a member with a specific team role.
 * Permission: manage:team. Plan limit: team.invite.
 *
 * The raw token is emailed to the invitee; only the SHA-256 hash is stored.
 * Single-use, 72h expiry. Pass { resend: true } to re-issue an expired invite.
 */
export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "team-invite", permission: "manage:team" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, InviteBodySchema);
  if ("response" in parsed) return parsed.response;
  const { email, role, resend } = parsed.data;

  const ent = await checkEntitlement(session.teamId, "team.invite");
  if ("response" in ent) return ent.response;

  await connectDB();
  const team = await TeamModel.findById(toObjectId(session.teamId));
  if (!team) return fail("Team not found", 404, "TEAM_NOT_FOUND");

  // Already an active member?
  const existingUser = await UserModel.findOne({ email }).select("_id").lean();
  if (
    existingUser &&
    team.members.some(
      (m: ITeamMember) =>
        m.userId?.toString() === existingUser._id.toString() && m.status === "active"
    )
  ) {
    return fail("This user is already a member", 409, "ALREADY_MEMBER");
  }

  // Resend: find the pending invite first
  const pendingIdx = team.members.findIndex(
    (m: ITeamMember) => m.inviteEmail === email && m.status === "pending"
  );

  if (resend && pendingIdx === -1) {
    return fail("No pending invite for this email", 404, "INVITE_NOT_FOUND");
  }
  if (!resend && pendingIdx !== -1) {
    return fail("An invite is already pending for this email — use resend", 409, "INVITE_PENDING");
  }

  const rawToken = randomBytes(32).toString("hex");
  const invite = {
    userId: existingUser?._id ?? new mongoose.Types.ObjectId(),
    role: role as TeamRole,
    invitedAt: new Date(),
    inviteEmail: email,
    inviteTokenHash: hashToken(rawToken),
    inviteExpires: new Date(Date.now() + INVITE_TTL_MS),
    status: "pending" as const,
  };

  if (pendingIdx !== -1) {
    team.members[pendingIdx].role = invite.role;
    team.members[pendingIdx].inviteTokenHash = invite.inviteTokenHash;
    team.members[pendingIdx].inviteExpires = invite.inviteExpires;
    team.members[pendingIdx].invitedAt = new Date();
  } else {
    team.members.push(invite);
  }
  await team.save();

  try {
    const inviter = await UserModel.findById(toObjectId(session.userId)).select("name").lean();
    await sendTeamInviteEmail(email, inviter?.name ?? "Your teammate", team.name, rawToken);
  } catch (e) {
    logger.error("invite email failed", toLogError(e), { teamId: session.teamId });
    // Invite still exists — the owner can resend from the team page.
  }

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "user.invited",
      description: `Invited ${email} as ${role}`,
      resourceType: "Team",
      resourceId: session.teamId,
      metadata: { email, role },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ success: true, email, role });
}

/**
 * GET /api/team/invite — list pending invites (manage:team).
 */
export async function GET(req: Request) {
  const authed = await requireAuth(req, { permission: "manage:team" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  await connectDB();
  const team = await TeamModel.findById(toObjectId(session.teamId))
    .select("members.inviteEmail members.role members.status members.invitedAt members.inviteExpires")
    .lean();
  if (!team) return fail("Team not found", 404, "TEAM_NOT_FOUND");

  const invites = (team.members ?? [])
    .filter((m: ITeamMember) => m.status === "pending")
    .map((m: ITeamMember) => ({
      email: m.inviteEmail,
      role: m.role,
      invitedAt: m.invitedAt,
      inviteExpires: m.inviteExpires,
      expired: m.inviteExpires ? new Date(m.inviteExpires) < new Date() : false,
    }));

  return NextResponse.json({ invites });
}

/**
 * DELETE /api/team/invite?email=… — revoke a pending invite (manage:team).
 */
export async function DELETE(req: Request) {
  const authed = await requireAuth(req, { permission: "manage:team" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
  if (!email) return fail("email query param required", 400, "VALIDATION_ERROR");

  await connectDB();
  const team = await TeamModel.findById(toObjectId(session.teamId));
  if (!team) return fail("Team not found", 404, "TEAM_NOT_FOUND");

  const before = team.members.length;
  team.members = team.members.filter(
    (m: ITeamMember) => !(m.inviteEmail === email && m.status === "pending")
  ) as typeof team.members;
  if (team.members.length === before) {
    return fail("No pending invite for this email", 404, "INVITE_NOT_FOUND");
  }
  await team.save();

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "user.invite_revoked",
      description: `Revoked invite for ${email}`,
      resourceType: "Team",
      resourceId: session.teamId,
      metadata: { email },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ success: true });
}
