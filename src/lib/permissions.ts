/**
 * Team role permissions — the single source of truth for authorization.
 *
 * Roles: owner > admin > member > viewer (viewer is read-only everywhere).
 *
 * Permission map:
 *   write:data    — create/update/delete business data (orders, products,
 *                   stores, goals, reports, notifications…)
 *   edit:cogs     — change COGS rules and per-variant costs
 *   manage:team   — invite / remove / change roles (owner-only actions
 *                   like transfer are checked separately)
 *   manage:billing— checkout, portal, cancel, plan changes
 *   manage:apikeys— create / revoke API keys
 *   view:audit    — read the audit log
 *
 * Never trust the client: every mutating route resolves the caller's
 * membership from the DB (or the signed session) and checks can().
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import TeamModel, { type TeamRole } from "@/models/Team";

export type Permission =
  | "write:data"
  | "edit:cogs"
  | "manage:team"
  | "manage:billing"
  | "manage:apikeys"
  | "view:audit";

const ROLE_RANK: Record<TeamRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

const PERMISSION_MAP: Record<Permission, TeamRole[]> = {
  "write:data": ["owner", "admin", "member"],
  "edit:cogs": ["owner", "admin", "member"],
  "manage:team": ["owner", "admin"],
  "manage:billing": ["owner"],
  "manage:apikeys": ["owner", "admin"],
  "view:audit": ["owner", "admin"],
};

/** Pure check — does `role` grant `perm`? */
export function can(role: TeamRole | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return (PERMISSION_MAP[perm] ?? []).includes(role);
}

/** True when `role` outranks (or equals) `other`. */
export function outranks(role: TeamRole, other: TeamRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[other];
}

/** Resolve the caller's team role from the DB. Returns null when not a member. */
export async function getTeamRole(
  teamId: string,
  userId: string
): Promise<TeamRole | null> {
  if (!mongoose.Types.ObjectId.isValid(teamId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  await connectDB();
  const team = await TeamModel.findById(teamId)
    .select("members.userId members.role members.status")
    .lean();
  const member = team?.members?.find(
    (m: { userId?: unknown; status?: string }) =>
      m.userId?.toString() === userId && m.status === "active"
  ) as { role?: TeamRole } | undefined;
  return member?.role ?? null;
}

export interface PermissionCheck {
  teamId: string;
  userId: string;
  role: TeamRole | null;
  allowed: boolean;
}

/**
 * Route-level permission gate. Returns null when allowed, otherwise a
 * 403 NextResponse. Use after requireAuth():
 *
 *   const denied = await requirePermission(session.teamId, session.userId, "write:data");
 *   if (denied) return denied;
 */
export async function requirePermission(
  teamId: string,
  userId: string,
  perm: Permission
): Promise<NextResponse | null> {
  const role = await getTeamRole(teamId, userId);
  if (!can(role, perm)) {
    return NextResponse.json(
      { error: "Forbidden — insufficient team role", code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Count active owners on a team. Used to block removing or downgrading
 * the last owner.
 */
export async function countActiveOwners(teamId: string): Promise<number> {
  await connectDB();
  const team = await TeamModel.findById(teamId)
    .select("members.role members.status")
    .lean();
  return (team?.members ?? []).filter(
    (m: { role?: string; status?: string }) => m.role === "owner" && m.status === "active"
  ).length;
}

/**
 * Guard: would removing/downgrading `targetUserId` leave zero active owners?
 * Returns an error message when blocked, or null when allowed.
 */
export async function lastOwnerGuard(
  teamId: string,
  targetUserId: string
): Promise<string | null> {
  await connectDB();
  const team = await TeamModel.findById(teamId)
    .select("members.userId members.role members.status")
    .lean();
  if (!team) return "Team not found";

  const target = team.members.find(
    (m: { userId?: unknown }) => m.userId?.toString() === targetUserId
  ) as { role?: TeamRole; status?: string } | undefined;

  if (!target || target.role !== "owner" || target.status !== "active") {
    return null; // not an active owner — no guard needed
  }
  const owners = team.members.filter(
    (m: { role?: string; status?: string }) => m.role === "owner" && m.status === "active"
  ).length;
  if (owners <= 1) {
    return "Cannot remove or downgrade the last owner — transfer ownership first.";
  }
  return null;
}
