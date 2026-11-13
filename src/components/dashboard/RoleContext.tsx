"use client";

import { createContext, useContext } from "react";

/**
 * Two-role model:
 *   superAdmin — website operator (internal admin panel, user management)
 *   owner      — paying subscriber (full access to their workspace)
 */
export type UserRole = "superAdmin" | "owner";
export type UserPlan = "free" | "starter" | "growth" | "pro";

/**
 * Team-level membership role (mirrors src/models/Team.ts — defined here
 * rather than imported so this client component never pulls in Mongoose).
 * Authority: src/lib/permissions.ts — "viewer is read-only everywhere".
 */
export type TeamRole = "owner" | "admin" | "member" | "viewer";

export interface RoleContextValue {
  role: UserRole;
  plan: UserPlan;
  /** The caller's team membership role, when known (null for a stale session). */
  teamRole: TeamRole | null;
  /** False for a team viewer; true for every other known role. */
  canWrite: boolean;
  /** Always true — owner manages their own workspace */
  canManageTeam: boolean;
  /** Always true for owner; superAdmin manages from the admin panel */
  canManageBilling: boolean;
  /** Always true — owner can edit COGS in their workspace */
  canEditCogs: boolean;
  /** Whether this user is the internal superAdmin */
  isSuperAdmin: boolean;
}

export const RoleContext = createContext<RoleContextValue>({
  role: "owner",
  plan: "free",
  teamRole: null,
  canWrite: true,
  canManageTeam: true,
  canManageBilling: true,
  canEditCogs: true,
  isSuperAdmin: false,
});

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}

export function buildRoleContext(role: UserRole, plan: UserPlan, teamRole: TeamRole | null = null): RoleContextValue {
  const isSuperAdmin = role === "superAdmin";
  return {
    role,
    plan,
    teamRole,
    // A team viewer is read-only everywhere (src/lib/permissions.ts).
    // When the team role is unknown (stale session), keep the historical
    // permissive default — the server still enforces write:data, so this
    // only ever affects which buttons are shown, never what succeeds.
    canWrite: teamRole !== "viewer",
    canManageTeam: true,
    canManageBilling: !isSuperAdmin, // superAdmin uses admin panel, not billing tab
    canEditCogs: true,
    isSuperAdmin,
  };
}

interface RoleProviderProps {
  role: UserRole;
  plan: UserPlan;
  teamRole?: TeamRole | null;
  children: React.ReactNode;
}

export function RoleProvider({ role, plan, teamRole = null, children }: RoleProviderProps) {
  return (
    <RoleContext.Provider value={buildRoleContext(role, plan, teamRole)}>
      {children}
    </RoleContext.Provider>
  );
}
