"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, ShoppingCart, Package, Megaphone,
  Sliders, Target, FileText, Settings, LogOut, TrendingUp, AlertTriangle, Truck, Bell, ShieldAlert, PackageSearch,
  Calculator, ChevronRight, Users, Zap, Key, ClipboardList,
  Crown, Clock, Globe, ShieldCheck, BarChart3, Gauge, BookOpen, Droplets, Wallet, Coins, Receipt, Store, Landmark, Sparkles, Bookmark, CalendarClock, Ship, Banknote, ChevronDown, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  /** Shown only to owner/superAdmin platform roles. */
  ownerOnly?: boolean;
}

interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: "OVERVIEW",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/mission-control", label: "Mission Control", icon: Gauge },
    ],
  },
  {
    title: "PROFIT",
    items: [
      { href: "/dashboard/orders", label: "Order Profitability", icon: ShoppingCart },
      { href: "/dashboard/product-intel", label: "Product Profitability", icon: PackageSearch },
      { href: "/dashboard/profit", label: "Profit Trends", icon: TrendingUp },
      { href: "/dashboard/pnl", label: "P&L Report", icon: FileText },
      { href: "/dashboard/revenue-by-date", label: "Revenue By Date", icon: BarChart3 },
      { href: "/dashboard/countries", label: "Country Analysis", icon: Globe },
      { href: "/dashboard/conversion", label: "Product Conversion", icon: BarChart3 },
      { href: "/dashboard/ltv", label: "Lifetime Value", icon: Users },
      { href: "/dashboard/customers", label: "Customers", icon: Users },
      { href: "/dashboard/report-guide", label: "Report Guide", icon: BookOpen },
    ],
  },
  {
    title: "COSTS",
    items: [
      { href: "/dashboard/cogs-hub", label: "COGS Hub", icon: Package },
      { href: "/dashboard/products", label: "Products", icon: Package },
      { href: "/dashboard/monthly-expenses", label: "Monthly Expenses", icon: Receipt },
      { href: "/dashboard/ad-platforms", label: "Ad Platforms", icon: Megaphone },
      { href: "/dashboard/ad-spend", label: "Ad Spend", icon: Megaphone },
      { href: "/dashboard/other-fees", label: "Other Fees", icon: Coins },
    ],
  },
  {
    title: "PROTECT",
    items: [
      { href: "/dashboard/risk", label: "Fake-Order Risk", icon: AlertTriangle },
      { href: "/dashboard/alerts", label: "Alerts", icon: ShieldAlert },
      { href: "/dashboard/leaks", label: "Profit Leak Detector", icon: Droplets },
    ],
  },
  {
    title: "LOGISTICS",
    items: [
      { href: "/dashboard/couriers", label: "Couriers", icon: Truck },
      { href: "/dashboard/shipments", label: "Shipments", icon: Ship },
      { href: "/dashboard/profit", label: "COD Cash Flow", icon: Banknote },
    ],
  },
  {
    title: "GROWTH",
    items: [
      { href: "/dashboard/goals", label: "Goals", icon: Target },
      { href: "/dashboard/simulator", label: "Simulator", icon: Sliders },
      { href: "/dashboard/bundles", label: "Bundles", icon: Zap },
      { href: "/dashboard/copilot", label: "AI Copilot", icon: Sparkles },
      { href: "/dashboard/saved-views", label: "Saved Views", icon: Bookmark },
      { href: "/dashboard/scheduled-reports", label: "Scheduled Reports", icon: CalendarClock },
      { href: "/dashboard/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { href: "/dashboard/general", label: "General", icon: Settings },
      { href: "/dashboard/stores", label: "Stores", icon: Store },
      { href: "/dashboard/gateways", label: "Gateways", icon: Landmark },
      { href: "/dashboard/currency", label: "Currency", icon: Coins },
      { href: "/dashboard/tax", label: "Tax / VAT", icon: Receipt },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/team", label: "Team", icon: Users, ownerOnly: true },
      { href: "/dashboard/settings/api-keys", label: "API & Webhooks", icon: Key, ownerOnly: true },
      { href: "/dashboard/settings?tab=billing", label: "Billing", icon: Wallet, ownerOnly: true },
      { href: "/dashboard/settings/audit-log", label: "Audit Log", icon: ClipboardList, ownerOnly: true },
      { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
      { href: "/dashboard/settings/jobs", label: "Jobs", icon: Clock, ownerOnly: true },
      { href: "/dashboard/settings", label: "All Settings", icon: Settings },
    ],
  },
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
  plan,
  role = "owner",
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [triggeredAlerts, setTriggeredAlerts] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect -- restore persisted collapsed groups on mount */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gpc-sidebar-collapsed");
      if (saved) setCollapsed(JSON.parse(saved) as Record<string, boolean>);
    } catch { /* private mode — collapsing still works for the session */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.evaluations)) {
          setTriggeredAlerts(j.evaluations.filter((e: { triggered?: boolean }) => e.triggered).length);
        }
      })
      .catch(() => undefined);
  }, []);

  // Ctrl+K / Cmd+K focuses the sidebar search (command search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("sidebar-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string, exact?: boolean) => {
    const path = href.split("?")[0];
    return exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };

  const toggleGroup = (title: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try { localStorage.setItem("gpc-sidebar-collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.ownerOnly && role !== "owner" && role !== "superAdmin") return false;
        if (q && !item.label.toLowerCase().includes(q)) return false;
        return true;
      }),
    })).filter((g) => g.items.length > 0);
  }, [query, role]);

  const firstMatch = visibleGroups[0]?.items[0];

  return (
    <aside className="flex flex-col h-full w-64 bg-[var(--color-card)] border-r border-[var(--color-border)]">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--color-border)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white flex-shrink-0">
          <Calculator className="h-4 w-4" />
        </span>
        <span className="font-bold text-lg text-[var(--color-foreground)]">
          Profit<span className="text-[var(--color-primary)]">Calc</span>
        </span>
      </div>

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

      {/* Command search: Ctrl+K focuses, Enter goes to the first match */}
      <form
        className="px-3 pt-3"
        onSubmit={(e) => { e.preventDefault(); if (firstMatch) router.push(firstMatch.href); }}
      >
        <label className="relative block">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            id="sidebar-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages… (Ctrl+K)"
            aria-label="Search dashboard pages"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
          />
        </label>
      </form>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4" aria-label="Dashboard navigation">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            <button
              type="button"
              onClick={() => toggleGroup(group.title)}
              aria-expanded={!collapsed[group.title]}
              className="flex w-full items-center justify-between px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              {group.title}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed[group.title] && "-rotate-90")} />
            </button>
            {!collapsed[group.title] && (
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon, exact }) => {
                  const active = isActive(href, exact);
                  const badge = label === "Alerts" && triggeredAlerts > 0 ? String(triggeredAlerts) : undefined;
                  return (
                    <Link
                      key={href + label}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        active
                          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1">{label}</span>
                      {badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600">
                          {badge}
                        </span>
                      )}
                      {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {visibleGroups.length === 0 && (
          <p className="px-3 text-sm text-[var(--color-muted-foreground)]">No pages match “{query}”.</p>
        )}
      </nav>

      <div className="px-3 pb-2">
        <UsageMeter />
      </div>

      {plan !== "pro" && (
        <div className="px-3 pb-3">
          <Link
            href="/dashboard/settings?tab=billing"
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
