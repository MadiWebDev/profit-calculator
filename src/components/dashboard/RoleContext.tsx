"use client";

import { createContext, useContext } from "react";

export type UserRole = "owner" | "admin" | "member" | "viewer";
export type UserPlan = "free" | "starter" | "growth" | "pro";

export interface RoleContextValue {
  role: UserRole;
  plan: UserPlan;
  /** Whether this user can mutate data (owner, admin, member but NOT viewer) */
  canWrite: boolean;
  /** Whether this user can manage team members */
  canManageTeam: boolean;
  /** Whether this user can manage billing and API keys */
  canManageBilling: boolean;
  /** Whether this user can edit COGS */
  canEditCogs: boolean;
}

export const RoleContext = createContext<RoleContextValue>({
  role: "viewer",
  plan: "free",
  canWrite: false,
  canManageTeam: false,
  canManageBilling: false,
  canEditCogs: false,
});

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}

export function buildRoleContext(role: UserRole, plan: UserPlan): RoleContextValue {
  return {
    role,
    plan,
    canWrite: role !== "viewer",
    canManageTeam: role === "owner" || role === "admin",
    canManageBilling: role === "owner",
    canEditCogs: role === "owner" || role === "admin" || role === "member",
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
