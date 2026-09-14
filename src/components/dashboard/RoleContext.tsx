"use client";

import { createContext, useContext } from "react";

/**
 * Two-role model:
 *   superAdmin — website operator (internal admin panel, user management)
 *   owner      — paying subscriber (full access to their workspace)
 */
export type UserRole = "superAdmin" | "owner";
export type UserPlan = "free" | "starter" | "growth" | "pro";

export interface RoleContextValue {
  role: UserRole;
  plan: UserPlan;
  /** Always true for both roles — all dashboard users can write */
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
  canWrite: true,
  canManageTeam: true,
  canManageBilling: true,
  canEditCogs: true,
  isSuperAdmin: false,
});

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}

export function buildRoleContext(role: UserRole, plan: UserPlan): RoleContextValue {
  const isSuperAdmin = role === "superAdmin";
  return {
    role,
    plan,
    canWrite: true,
    canManageTeam: true,
    canManageBilling: !isSuperAdmin, // superAdmin uses admin panel, not billing tab
    canEditCogs: true,
    isSuperAdmin,
  };
}

interface RoleProviderProps {
  role: UserRole;
  plan: UserPlan;
  children: React.ReactNode;
}

export function RoleProvider({ role, plan, children }: RoleProviderProps) {
  return (
    <RoleContext.Provider value={buildRoleContext(role, plan)}>
      {children}
    </RoleContext.Provider>
  );
}
