"use client";

import { useRole } from "@/components/dashboard/RoleContext";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SuperAdminGate — renders children only when the current user is superAdmin.
 * Use this to hide superAdmin-only UI elements inside the dashboard.
 */
export function SuperAdminGate({
  fallback = null,
  children,
}: {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isSuperAdmin } = useRole();
  return isSuperAdmin ? <>{children}</> : <>{fallback}</>;
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

/** A locked overlay for inputs/cells — kept for plan-gated UI where needed */
export function LockedCell({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div
      className={cn("relative group inline-flex items-center gap-1.5 cursor-not-allowed")}
      title={tooltip ?? "Requires a higher plan"}
    >
      <span className="opacity-70 select-none">{children}</span>
      <Lock className="h-3 w-3 text-[var(--color-muted-foreground)] opacity-50 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
