"use client";

import { useRole, type UserRole } from "@/components/dashboard/RoleContext";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoleGateProps {
  /** Minimum role required. Hierarchy: owner > admin > member > viewer */
  minRole?: UserRole;
  /** Exact roles allowed */
  allowedRoles?: UserRole[];
  /** What to render when access is denied. Defaults to null (hide silently). */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const ROLE_RANK: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export function RoleGate({ minRole, allowedRoles, fallback = null, children }: RoleGateProps) {
  const { role } = useRole();

  let allowed = true;
  if (minRole) {
    allowed = ROLE_RANK[role] >= ROLE_RANK[minRole];
  }
  if (allowedRoles) {
    allowed = allowedRoles.includes(role);
  }

  return allowed ? <>{children}</> : <>{fallback}</>;
}

/** A locked overlay used on inputs/cells that viewer cannot edit */
export function LockedCell({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return (
    <div
      className="relative group inline-flex items-center gap-1.5 cursor-not-allowed"
      title={tooltip ?? "Read-only — insufficient permissions"}
    >
      <span className="opacity-70 select-none">{children}</span>
      <Lock className="h-3 w-3 text-[var(--color-muted-foreground)] opacity-50 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

/** Full-width read-only banner shown at page top for viewers */
export function ViewerBanner({ message }: { message?: string }) {
  const { role } = useRole();
  if (role !== "viewer") return null;
  return (
    <div className={cn(
      "flex items-center gap-2.5 rounded-lg border border-[var(--color-border)]",
      "bg-[var(--color-muted)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]"
    )}>
      <Lock className="h-4 w-4 flex-shrink-0 text-[var(--color-primary)]" />
      <span>
        {message ?? "You have read-only access. Contact your team owner to request a higher permission level."}
      </span>
    </div>
  );
}

/** Banner for features locked behind a plan */
export function PlanGate({
  minPlan,
  featureName,
  children,
}: {
  minPlan: "starter" | "growth" | "pro";
  featureName: string;
  children: React.ReactNode;
}) {
  const { plan } = useRole();
  const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, growth: 2, pro: 3 };
  const hasAccess = (PLAN_RANK[plan] ?? 0) >= PLAN_RANK[minPlan];

  if (hasAccess) return <>{children}</>;

  return (
    <div className="relative rounded-xl border border-dashed border-[var(--color-border)] overflow-hidden">
      <div className="absolute inset-0 bg-[var(--color-background)]/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 gap-2">
        <Lock className="h-5 w-5 text-[var(--color-muted-foreground)]" />
        <p className="text-sm font-medium text-[var(--color-foreground)]">{featureName}</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Requires <span className="capitalize font-semibold">{minPlan}</span> plan or higher
        </p>
      </div>
      <div className="pointer-events-none select-none opacity-30">
        {children}
      </div>
    </div>
  );
}
