import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { RoleProvider } from "@/components/dashboard/RoleContext";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

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

  const role: UserRole = user.role ?? "viewer";
  const plan: UserPlan = user.plan ?? "free";

  return (
    <RoleProvider role={role} plan={plan}>
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
          {/* Mobile topbar */}
          <DashboardTopbar
            userName={user.name ?? "User"}
            userEmail={user.email ?? ""}
            plan={plan}
            role={role}
          />

          {/* Desktop topbar strip */}
          <div className="hidden lg:flex items-center justify-end gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-card)] flex-shrink-0">
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
