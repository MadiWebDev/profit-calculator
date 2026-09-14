import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Calculator, Users, LogOut, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session.user as any).role;
  if (role !== "superAdmin") redirect("/dashboard");

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-background)]">
      {/* Sidebar */}
      <aside className="flex flex-col w-56 bg-[var(--color-card)] border-r border-[var(--color-border)] flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--color-border)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white flex-shrink-0">
            <Calculator className="h-4 w-4" />
          </span>
          <span className="font-bold text-sm text-[var(--color-foreground)]">
            Admin<span className="text-red-500">Panel</span>
          </span>
        </div>

        {/* Badge */}
        <div className="px-4 py-2 border-b border-[var(--color-border)]">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
            Super Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {[
            { href: "/admin",       label: "Overview",  icon: LayoutDashboard, exact: true },
            { href: "/admin/users", label: "Users",     icon: Users },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] p-3 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] transition-colors"
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
