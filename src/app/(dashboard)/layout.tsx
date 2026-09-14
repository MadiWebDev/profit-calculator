import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAccountStatus } from "@/lib/trial";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { RoleProvider } from "@/components/dashboard/RoleContext";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";
import { CurrencySelector } from "@/components/dashboard/CurrencySelector";
import { ArchivedWall } from "@/components/billing/ArchivedWall";
import { TrialBanner } from "@/components/billing/TrialBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as {
    name?: string | null;
    email?: string | null;
    plan?: UserPlan;
    role?: UserRole;
    teamId?: string | null;
  };

  const role: UserRole  = user.role  ?? "viewer";
  const plan: UserPlan  = user.plan  ?? "free";
  const teamId: string  = user.teamId ?? "";

  // ── Trial / archival check ─────────────────────────────────────────────────
  // Only run for team owners/admins — viewers & members follow the team owner's status.
  const trialInfo = teamId
    ? await getAccountStatus(teamId)
    : null;

  const isArchived = trialInfo?.isArchived ?? false;
  const isTrialing = trialInfo?.status === "trialing";

  return (
    <RoleProvider role={role} plan={plan}>
      {/* ── Archived wall — replaces all content ── */}
      {isArchived && (
        <ArchivedWall
          trialEndedAt={trialInfo?.trialEndsAt}
          userName={user.name ?? undefined}
        />
      )}

      <div className="flex h-screen overflow-hidden bg-[var(--color-background)]">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <DashboardSidebar
            userName={user.name ?? "User"}
            userEmail={user.email ?? ""}
            plan={plan}
            role={role}
          />
        </div>

        {/* Main content area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Trial banner — sits above the mobile topbar */}
          {isTrialing && !isArchived && trialInfo && (
            <TrialBanner daysLeft={trialInfo.daysLeft} />
          )}

          {/* Mobile topbar */}
          <DashboardTopbar
            userName={user.name ?? "User"}
            userEmail={user.email ?? ""}
            plan={plan}
            role={role}
          />

          {/* Desktop topbar strip */}
          <div className="hidden lg:flex items-center justify-end gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-card)] flex-shrink-0">
            <CurrencySelector size="md" />
            <NotificationBell />
            <ThemeToggle />
          </div>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </RoleProvider>
  );
}
