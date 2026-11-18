"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, ShoppingCart, Package, Megaphone,
  Sliders, Target, FileText, Settings, LogOut, TrendingUp, AlertTriangle, Truck, Bell, ShieldAlert, PackageSearch,
  ChevronRight, Users, Zap, Key, ClipboardList,
  Crown, Clock, Globe, ShieldCheck, BarChart3, Gauge, BookOpen, Droplets, Wallet, Coins, Receipt, Store, Landmark, Sparkles, Bookmark, CalendarClock, Ship, ChevronDown, Search, LifeBuoy, Mail,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { ThemeToggle } from "@/components/ThemeToggle";
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
    title: "SUPPORT",
    items: [
      { href: "/help", label: "Help Center", icon: LifeBuoy },
      { href: "/help/contact", label: "Contact Support", icon: Mail },
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

/** localStorage key for the wide (expanded ↔ icon-only) collapse choice.
 * Separate from "gpc-sidebar-collapsed", which stores the per-GROUP
 * collapse map. The same literal appears in the pre-paint inline script
 * in src/app/(dashboard)/layout.tsx — keep the two in sync. */
const WIDE_COLLAPSED_KEY = "gpc-sidebar-wide-collapsed";
const EXPANDED_WIDTH = "16rem";
const COLLAPSED_WIDTH = "4.5rem";

interface DashboardSidebarProps {
  userName?: string;
  userEmail?: string;
  plan?: UserPlan;
  role?: UserRole;
  /**
   * Enable the desktop wide-collapse (expanded ↔ icon-only). Only the
   * desktop instance in the dashboard layout passes this — the mobile
   * drawer (DashboardTopbar) always renders fully expanded, because a
   * 72px drawer would be unusable.
   */
  collapsible?: boolean;
}

export function DashboardSidebar({
  userName = "User",
  userEmail = "",
  plan,
  role = "owner",
  collapsible = false,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  // All groups start collapsed — the sidebar opens clean and the user
  // expands only the section they need. A saved preference (from a
  // previous visit) still wins: the mount effect below restores it.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((g): [string, boolean] => [g.title, true])),
  );
  const [triggeredAlerts, setTriggeredAlerts] = useState(0);

  // ── Wide collapse (desktop only) ──────────────────────────────────────────
  // Read the persisted choice lazily so the first client render already
  // matches it. The width itself never flashes: a pre-paint inline script
  // in the dashboard layout sets the same --sidebar-w variable before the
  // sidebar is painted (see layout.tsx), and the aside's width is driven
  // by that variable, so the className is identical server/client.
  const [wideCollapsed, setWideCollapsed] = useState<boolean>(() => {
    if (!collapsible || typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(WIDE_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const isCollapsed = collapsible && wideCollapsed;
  // The width transition stays off until after mount, so the first paint
  // (or a hydration correction) never animates.
  const [mounted, setMounted] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- mounted flag enables the width transition only after first paint */
  useEffect(() => {
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keep the --sidebar-w variable (and storage) in sync with the state.
  useEffect(() => {
    if (!collapsible) return;
    try {
      document.documentElement.style.setProperty(
        "--sidebar-w",
        wideCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
      );
      window.localStorage.setItem(WIDE_COLLAPSED_KEY, wideCollapsed ? "1" : "0");
    } catch {
      /* private mode — collapse still works for the session */
    }
  }, [collapsible, wideCollapsed]);

  // ── Icon-rail tooltip ─────────────────────────────────────────────────────
  // One shared, fixed-position tooltip (not a child of the scrollable nav,
  // so it is never clipped by it, and it cannot force horizontal overflow).
  // Shown on hover AND on keyboard focus, positioned from the target's
  // bounding rect. Only used while the sidebar is collapsed — expanded
  // rows already show their labels.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const showTip = (label: string, el: HTMLElement) => {
    if (!isCollapsed) return;
    const rect = el.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2 });
  };
  const hideTip = () => setTip(null);

  const toggleWide = () => {
    if (!collapsible) return;
    setWideCollapsed((prev) => !prev);
  };

  const expandAndFocusSearch = () => {
    if (!collapsible) return;
    setWideCollapsed(false);
    // The search input only exists while expanded — focus after the state
    // update has rendered it.
    window.setTimeout(() => {
      document.getElementById("sidebar-search")?.focus();
    }, 60);
  };

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

  // Ctrl+K / Cmd+K focuses the sidebar search (command search). While the
  // sidebar is collapsed the search input is hidden, so expand first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isCollapsed) expandAndFocusSearch();
        else document.getElementById("sidebar-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed]);

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

  const toggleLabel = wideCollapsed ? "Expand sidebar" : "Collapse sidebar";
  const roleLabel = `${role === "superAdmin" ? "Super Admin" : "Owner"} · ${plan ?? "free"}`;

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-[var(--color-card)] border-r border-[var(--color-border)] overflow-hidden",
        collapsible ? "w-[var(--sidebar-w,16rem)]" : "w-64",
        collapsible && mounted && "transition-[width] duration-300 ease-in-out",
      )}
    >
      {/* Header: role badge + collapse toggle (desktop only). Collapsed:
          toggle on top, crown below — 72px is too narrow for a row. */}
      <div className={cn("px-4 py-2.5", isCollapsed && "px-0 pt-3 flex flex-col items-center gap-2")}>
        {isCollapsed ? (
          <>
            <button
              type="button"
              onClick={toggleWide}
              aria-expanded={false}
              aria-label={toggleLabel}
              onMouseEnter={(e) => showTip(toggleLabel, e.currentTarget)}
              onMouseLeave={hideTip}
              onFocus={(e) => showTip(toggleLabel, e.currentTarget)}
              onBlur={hideTip}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <span title={roleLabel} aria-label={roleLabel} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-muted)] border border-[var(--color-border)]">
              <Crown className="h-3.5 w-3.5 text-yellow-500" />
            </span>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <div className={cn(
              "inline-flex min-w-0 items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
              "bg-[var(--color-muted)] border border-[var(--color-border)]",
            )}>
              <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />
              <span className="text-yellow-500 truncate">
                {role === "superAdmin" ? "Super Admin" : "Owner"}
              </span>
              <span className="text-[var(--color-muted-foreground)] font-normal capitalize truncate">· {plan}</span>
            </div>
            {collapsible && (
              <button
                type="button"
                onClick={toggleWide}
                aria-expanded={true}
                aria-label={toggleLabel}
                title={toggleLabel}
                className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Command search: Ctrl+K focuses, Enter goes to the first match.
          Collapsed: an icon button that expands the sidebar and focuses it. */}
      {isCollapsed ? (
        <div className="pt-3 flex justify-center">
          <button
            type="button"
            onClick={expandAndFocusSearch}
            aria-label="Search pages"
            onMouseEnter={(e) => showTip("Search pages", e.currentTarget)}
            onMouseLeave={hideTip}
            onFocus={(e) => showTip("Search pages", e.currentTarget)}
            onBlur={hideTip}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      ) : (
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
      )}

      <nav
        className={cn("flex-1 overflow-y-auto py-4 space-y-4", isCollapsed ? "px-2" : "px-3")}
        aria-label="Dashboard navigation"
        onScroll={hideTip}
        onMouseLeave={hideTip}
      >
        {visibleGroups.map((group, groupIndex) => (
          <div key={group.title}>
            {isCollapsed ? (
              // Icon rail: groups are separated by a divider, not a heading.
              // Per-group collapse is ignored here (the rail shows every
              // item) and is preserved for when the sidebar expands again.
              groupIndex > 0 && (
                <div aria-hidden className="mx-1 mb-4 border-t border-[var(--color-border)]" />
              )
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={!collapsed[group.title]}
                className="flex w-full items-center justify-between px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                {group.title}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed[group.title] && "-rotate-90")} />
              </button>
            )}
            {(isCollapsed || !collapsed[group.title]) && (
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon, exact }) => {
                  const active = isActive(href, exact);
                  const badge = label === "Alerts" && triggeredAlerts > 0 ? String(triggeredAlerts) : undefined;
                  return (
                    <Link
                      key={href + label}
                      href={href}
                      aria-label={isCollapsed ? label : undefined}
                      aria-current={active ? "page" : undefined}
                      onMouseEnter={(e) => showTip(label, e.currentTarget)}
                      onMouseLeave={hideTip}
                      onFocus={(e) => showTip(label, e.currentTarget)}
                      onBlur={hideTip}
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60",
                        isCollapsed ? "relative justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                        active
                          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{label}</span>
                          {badge && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600">
                              {badge}
                            </span>
                          )}
                          {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                        </>
                      )}
                      {isCollapsed && badge && (
                        <span aria-hidden className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {visibleGroups.length === 0 && !isCollapsed && (
          <p className="px-3 text-sm text-[var(--color-muted-foreground)]">No pages match “{query}”.</p>
        )}
      </nav>

      {/* Usage meter + upgrade card need text width — hidden on the rail. */}
      {!isCollapsed && (
        <div className="px-3 pb-2">
          <UsageMeter />
        </div>
      )}

      {!isCollapsed && plan !== "pro" && (
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
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={`${userName}${userEmail ? ` — ${userEmail}` : ""}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-sm font-bold flex-shrink-0"
            >
              {(userName || userEmail).charAt(0).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              aria-label="Sign Out"
              onMouseEnter={(e) => showTip("Sign Out", e.currentTarget)}
              onMouseLeave={hideTip}
              onFocus={(e) => showTip("Sign Out", e.currentTarget)}
              onBlur={hideTip}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-sm font-bold flex-shrink-0">
                {(userName || userEmail).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{userName}</p>
                <p className="text-xs text-[var(--color-muted-foreground)] truncate">{userEmail}</p>
              </div>
              <div className="ml-auto shrink-0">
                <ThemeToggle />
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
          </>
        )}
      </div>

      {/* Shared icon-rail tooltip — fixed, so it escapes the scrollable nav
          and never causes horizontal overflow. */}
      {isCollapsed && tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[110] -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-foreground)] shadow-lg"
          style={{ left: "calc(var(--sidebar-w, 16rem) + 0.5rem)", top: tip.top }}
        >
          {tip.label}
        </div>
      )}
    </aside>
  );
}
