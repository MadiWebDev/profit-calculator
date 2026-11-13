import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAccountStatus } from "@/lib/trial";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { CurrencySelector } from "@/components/dashboard/CurrencySelector";
import { CurrencyConverter } from "@/components/currency/CurrencyConverter";
import { RoleProvider } from "@/components/dashboard/RoleContext";
import type { UserRole, UserPlan, TeamRole } from "@/components/dashboard/RoleContext";
import { ArchivedWall } from "@/components/billing/ArchivedWall";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { OnboardingModal } from "@/components/dashboard/OnboardingModal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  // S1: a session that has not completed 2FA cannot render any dashboard
  // page — send it to the verify step instead (API routes enforce this too).
  // Team-enforced enrolment takes precedence: a member who must set up
  // 2FA goes to the setup page, not the verify page (they have no secret
  // yet, so a code prompt would be a dead end).
  const su = session.user as { twoFactorPending?: boolean; twoFactorSetupRequired?: boolean };
  if (su.twoFactorSetupRequired) {
    redirect("/auth/2fa-setup");
  }
  if (su.twoFactorPending) {
    redirect("/auth/2fa-verify");
  }

  const user = session.user as {
    name?: string | null;
    email?: string | null;
    plan?: UserPlan;
    role?: UserRole;
    teamRole?: string | null;
    teamId?: string | null;
  };

  const teamId: string = user.teamId ?? "";

  // The caller's team membership role, resolved at sign-in into the JWT
  // (src/lib/auth.ts) — this is what makes canWrite real for viewers.
  // Anything unexpected falls back to null (permissive client default;
  // the server still enforces write:data on every mutation).
  const teamRole: TeamRole | null =
    user.teamRole === "owner" || user.teamRole === "admin" ||
    user.teamRole === "member" || user.teamRole === "viewer"
      ? user.teamRole
      : null;

  // ── Trial / archival / authoritative live plan check (reads DB every request) ──
  const trialInfo = teamId
    ? await getAccountStatus(teamId)
    : null;

  const role: UserRole = user.role ?? "owner";
  // Always prefer the fresh DB plan from Subscription / Team over stale JWT session
  const plan: UserPlan = (trialInfo?.plan as UserPlan) || user.plan || "free";

  const isArchived = trialInfo?.isArchived ?? false;
  const isTrialing = trialInfo?.status === "trialing";

  // ── HARD GATE: if archived, return ONLY the paywall — no dashboard HTML ───
  // Nothing else is sent to the browser, so DevTools element deletion has
  // nothing to reveal. The dashboard tree is never rendered or streamed.
  if (isArchived) {
    return (
      <RoleProvider role={role} plan={plan} teamRole={teamRole}>
        <ArchivedWall
          trialEndedAt={trialInfo?.trialEndsAt}
          userName={user.name ?? undefined}
          userEmail={user.email ?? undefined}
          teamId={teamId || undefined}
          paddleCustomerId={trialInfo?.paddleCustomerId}
        />
      </RoleProvider>
    );
  }

  return (
    <RoleProvider role={role} plan={plan} teamRole={teamRole}>
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
          {isTrialing && trialInfo && (
            <TrialBanner
              daysLeft={trialInfo.daysLeft}
              userEmail={user.email ?? undefined}
              teamId={teamId || undefined}
            />
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
            <CurrencyConverter />
            <CurrencySelector size="md" />
            <NotificationBell />
          </div>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
      {/* Blocking onboarding modal (first dashboard visit): mounts on the
          dashboard layout, gated on session + team + onboardingCompleted.
          No team yet → the user is on /onboarding, not here. */}
      <OnboardingModal />
    </RoleProvider>
  );
}
