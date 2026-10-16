import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { connectDB } from "@/lib/db";
import TeamModel, { type ITeamMember } from "@/models/Team";
import UserModel from "@/models/User";
import { auth } from "@/lib/auth";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import mongoose from "mongoose";

const AcceptBodySchema = z
  .object({ token: z.string().min(32).max(256) })
  .strict();

/**
 * POST /api/team/accept-invite — accept a team invite.
 *
 * The presented token is hashed (SHA-256) and matched against the stored
 * hash — the raw token never touches the DB query. Single-use: the hash is
 * cleared on accept. 72h expiry enforced.
 *
 * The invitee joins with the invited role. The user's platform role is
 * untouched (platform role ≠ team role).
 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, AcceptBodySchema);
  if ("response" in parsed) return parsed.response;
  const { token } = parsed.data;

  const tokenHash = createHash("sha256").update(token).digest("hex");

  await connectDB();

  const team = await TeamModel.findOne({ "members.inviteTokenHash": tokenHash }).select(
    "+members.inviteTokenHash"
  );
  if (!team) return fail("Invite not found or already used", 404, "INVITE_NOT_FOUND");

  const memberIdx = team.members.findIndex(
    (m: ITeamMember) => m.inviteTokenHash === tokenHash
  );
  if (memberIdx === -1) return fail("Invite not found or already used", 404, "INVITE_NOT_FOUND");
  const member = team.members[memberIdx];

  if (member.status !== "pending") {
    return fail("Invite has already been used", 410, "INVITE_USED");
  }
  if (member.inviteExpires && new Date() > new Date(member.inviteExpires)) {
    return fail("Invite expired — ask for a new one", 410, "INVITE_EXPIRED");
  }

  // The invitee must be signed in (or have an account with the invited email)
  const session = await auth();
  let userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId && member.inviteEmail) {
    const user = await UserModel.findOne({ email: member.inviteEmail }).select("_id").lean();
    if (user) userId = user._id.toString();
  }

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return NextResponse.json(
      { error: "Sign in or create an account first", requiresAuth: true, email: member.inviteEmail },
      { status: 401 }
    );
  }

  // If the user is already on another team, they keep their existing team —
  // invites only work for users without a team (documented assumption).
  const dbUser = await UserModel.findById(userId).select("teamId").lean();
  if (dbUser?.teamId && dbUser.teamId.toString() !== team._id.toString()) {
    return fail("This account already belongs to another workspace", 409, "ALREADY_ON_TEAM");
  }

  // Accept: activate membership, clear the single-use token
  team.members[memberIdx].status = "active";
  team.members[memberIdx].userId = toObjectId(userId);
  team.members[memberIdx].joinedAt = new Date();
  team.members[memberIdx].inviteTokenHash = undefined;
  team.members[memberIdx].inviteExpires = undefined;
  await team.save();

  await UserModel.findByIdAndUpdate(userId, { teamId: team._id });

  try {
    await logAudit({
      teamId: team._id as mongoose.Types.ObjectId,
      userId: toObjectId(userId),
      action: "user.invite_accepted",
      description: `Accepted invite as ${member.role}`,
      resourceType: "Team",
      resourceId: team._id.toString(),
      metadata: { role: member.role },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ success: true, teamName: team.name, role: member.role });
}
