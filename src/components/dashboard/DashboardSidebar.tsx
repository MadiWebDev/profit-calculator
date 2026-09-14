"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, ShoppingCart, Package, Megaphone,
  Sliders, Target, FileText, Settings, LogOut,
  Calculator, ChevronRight, Users, Zap, Key, ClipboardList,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: string;
}

/** All nav items — visible to every owner */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",           label: "Overview",     icon: LayoutDashboard, exact: true },
  { href: "/dashboard/orders",    label: "Orders",       icon: ShoppingCart },
  { href: "/dashboard/products",  label: "Products",     icon: Package },
  { href: "/dashboard/pnl",       label: "P&L Report",   icon: FileText },
  { href: "/dashboard/ad-spend",  label: "Ad Spend",     icon: Megaphone },
  { href: "/dashboard/ltv",       label: "LTV & Cohort", icon: Users },
  { href: "/dashboard/bundles",   label: "Bundles",      icon: Zap },
  { href: "/dashboard/simulator", label: "Simulator",    icon: Sliders },
  { href: "/dashboard/goals",     label: "Goals",        icon: Target },
  { href: "/dashboard/reports",   label: "Reports",      icon: FileText },
  { href: "/dashboard/settings",  label: "Settings",     icon: Settings },
];

/** Extra links shown under an "Owner" section */
const OWNER_SECTION: NavItem[] = [
  { href: "/dashboard/settings/api-keys",  label: "API Keys",  icon: Key },
  { href: "/dashboard/settings/audit-log", label: "Audit Log", icon: ClipboardList },
];

interface DashboardSidebarProps {
  userName?: string;
  userEmail?: string;
  plan?: UserPlan;
  role?: UserRole;
}

export function DashboardSidebar({
  userName = "User",
  userEmail = "",
  plan ,
  role = "owner",
}: DashboardSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="flex flex-col h-full w-64 bg-[var(--color-card)] border-r border-[var(--color-border)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--color-border)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white flex-shrink-0">
          <Calculator className="h-4 w-4" />
        </span>
        <span className="font-bold text-lg text-[var(--color-foreground)]">
          Profit<span className="text-[var(--color-primary)]">Calc</span>
        </span>
      </div>

      {/* Role badge */}
      <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
        <div className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
          "bg-[var(--color-muted)] border border-[var(--color-border)]",
        )}>
          <Crown className="h-3 w-3 text-yellow-500" />
          <span className="text-yellow-500">
            {role === "superAdmin" ? "Super Admin" : "Owner"}
          </span>
          <span className="text-[var(--color-muted-foreground)] font-normal capitalize">· {plan}</span>
        </div>
      </div>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
        aria-label="Dashboard navigation"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact, badge }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(href, exact)
                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            )}
            aria-current={isActive(href, exact) ? "page" : undefined}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                {badge}
              </span>
            )}
            {isActive(href, exact) && (
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            )}
          </Link>
        ))}

        {/* Owner section — API Keys & Audit Log */}
        <div className="pt-3 pb-1 px-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">
            Owner
          </p>
        </div>
        {OWNER_SECTION.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            )}
            aria-current={isActive(href) ? "page" : undefined}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {isActive(href) && (
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            )}
          </Link>
        ))}
      </nav>

      {/* Upgrade CTA — non-pro only */}
      {plan !== "pro" && (
        <div className="px-3 pb-3">
          <Link
            href="/pricing"
            className={cn(
              "block rounded-xl p-3 text-sm font-medium transition-colors",
              "bg-gradient-to-br from-[var(--color-primary)]/15 to-[var(--color-primary)]/5",
              "border border-[var(--color-primary)]/20 hover:border-[var(--color-primary)]/40",
              "text-[var(--color-foreground)]"
            )}
          >
            <p className="font-semibold text-[var(--color-primary)] mb-0.5">Upgrade Plan</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Unlock AI insights, unlimited orders &amp; more
            </p>
          </Link>
        </div>
      )}

      {/* User footer */}
      <div className="border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-sm font-bold flex-shrink-0">
            {(userName || userEmail).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{userName}</p>
            <p className="text-xs text-[var(--color-muted-foreground)] truncate">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
            "text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-red-600",
            "dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors"
          )}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
