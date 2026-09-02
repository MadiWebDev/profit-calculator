"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, ShoppingCart, Percent,
  Sparkles, RefreshCw, AlertCircle, CheckCircle2,
  Upload, Store, Target, Key, Users,
  ArrowRight, Zap, Download, Calendar,
  CheckSquare, Square, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import type { PeriodSummary } from "@/lib/profit-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiInsight {
  type: "positive" | "warning" | "info";
  title: string;
  body: string;
}

interface OverviewData {
  current: PeriodSummary;
  changes: { revenue: number; profit: number; margin: number; orders: number };
  chartData: { date: string; revenue: number; profit: number; orders: number }[];
  stores: { id?: string; name: string; platform: string; syncStatus: string; lastSyncAt?: string }[];
  hasOrders: boolean;
  /** Date range that was used to compute `current` */
  dateRange?: { from: string; to: string; label: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const platformIcon: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🔧", etsy: "🧶", csv_manual: "📄",
};

function syncBadge(status: string) {
  if (status === "idle")    return <Badge variant="success">Synced</Badge>;
  if (status === "syncing") return <Badge variant="outline" className="animate-pulse">Syncing…</Badge>;
  if (status === "error")   return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">Never synced</Badge>;
}

// ── Date Range Picker ─────────────────────────────────────────────────────────

interface DatePreset { label: string; from: string; to: string }

function getPresets(): DatePreset[] {
  const now  = new Date();
  const pad  = (n: number) => String(n).padStart(2, "0");
  const fmt  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
  const last30         = new Date(Date.now() - 29 * 86400_000);
  const last7          = new Date(Date.now() -  6 * 86400_000);
  const ytdStart       = new Date(now.getFullYear(), 0, 1);
  const lastYearStart  = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd    = new Date(now.getFullYear() - 1, 11, 31);

  return [
    { label: "This Month",   from: fmt(mtdStart),       to: today },
    { label: "Last Month",   from: fmt(lastMonthStart),  to: fmt(lastMonthEnd) },
    { label: "Last 7 Days",  from: fmt(last7),           to: today },
    { label: "Last 30 Days", from: fmt(last30),          to: today },
    { label: "Year to Date", from: fmt(ytdStart),        to: today },
    { label: "Last Year",    from: fmt(lastYearStart),   to: fmt(lastYearEnd) },
  ];
}

function DateRangePicker({
  from, to, onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string, label: string) => void;
}) {
  const [open,     setOpen]     = useState(false);
  const [localFrom, setFrom]    = useState(from);
  const [localTo,   setTo]      = useState(to);
  const presets = getPresets();

  const apply = (f: string, t: string, label: string) => {
    setFrom(f); setTo(t);
    onApply(f, t, label);
    setOpen(false);
  };

  const activePreset = presets.find((p) => p.from === from && p.to === to);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-2 h-8 text-xs"
        onClick={() => setOpen(!open)}
      >
        <Calendar className="h-3.5 w-3.5" />
        {activePreset?.label ?? `${from} → ${to}`}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-4 space-y-3">
          {/* Presets */}
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => apply(p.from, p.to, p.label)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg text-left transition-colors",
                  from === p.from && to === p.to
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-primary)]/10"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Custom range</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={localFrom}
                onChange={(e) => setFrom(e.target.value)}
                className="flex-1 h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
              />
              <span className="text-xs text-[var(--color-muted-foreground)]">to</span>
              <input
                type="date"
                value={localTo}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => apply(localFrom, localTo, `${localFrom} → ${localTo}`)}
              disabled={!localFrom || !localTo || localFrom > localTo}
            >
              Apply Range
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onboarding Checklist ──────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  desc: string;
  href: string;
  done: boolean;
}

function OnboardingChecklist({
  hasOrders,
  storesConnected,
  hasGoals,
  hasCogs,
}: {
  hasOrders: boolean;
  storesConnected: boolean;
  hasGoals: boolean;
  hasCogs: boolean;
}) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("overview_checklist_dismissed") === "1";
  });

  const items: ChecklistItem[] = [
    {
      id: "store",
      label: "Connect a store",
      desc: "Sync Shopify, WooCommerce, or Etsy",
      href: "/onboarding",
      done: storesConnected,
    },
    {
      id: "orders",
      label: "Import your first orders",
      desc: "Upload CSV or sync from your store",
      href: "/dashboard/orders",
      done: hasOrders,
    },
    {
      id: "cogs",
      label: "Set product COGS",
      desc: "Accurate margins require accurate costs",
      href: "/dashboard/products",
      done: hasCogs,
    },
    {
      id: "goals",
      label: "Set a profit goal",
      desc: "Track monthly progress at a glance",
      href: "/dashboard/goals",
      done: hasGoals,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const allDone = completedCount === items.length;

  if (dismissed || allDone) return null;

  return (
    <Card className="border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Getting Started</CardTitle>
            <span className="text-xs font-medium bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full">
              {completedCount}/{items.length} done
            </span>
          </div>
          <button
            onClick={() => {
              setDismissed(true);
              localStorage.setItem("overview_checklist_dismissed", "1");
            }}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          >
            Dismiss
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-[var(--color-border)] mt-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
            style={{ width: `${(completedCount / items.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map(({ id, label, desc, href, done }) => (
            <Link
              key={id}
              href={done ? "#" : href}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border transition-all",
                done
                  ? "border-green-200 bg-green-50/50 dark:bg-green-950/30 dark:border-green-900 cursor-default"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5"
              )}
              onClick={done ? (e) => e.preventDefault() : undefined}
            >
              {done
                ? <CheckSquare className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                : <Square className="h-4 w-4 text-[var(--color-muted-foreground)] flex-shrink-0 mt-0.5" />}
              <div>
                <p className={cn("text-sm font-medium", done ? "line-through text-[var(--color-muted-foreground)]" : "text-[var(--color-foreground)]")}>
                  {label}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportKpiCsv(current: PeriodSummary, label: string) {
  const rows = [
    ["Metric", "Value"],
    ["Period",              label],
    ["Total Revenue",       current.totalRevenue.toFixed(2)],
    ["Total COGS",          current.totalCogs.toFixed(2)],
    ["Gross Profit",        current.grossProfit.toFixed(2)],
    ["Gross Margin %",      current.grossMargin.toFixed(2)],
    ["Total Ad Spend",      current.totalAdSpend.toFixed(2)],
    ["Net Profit",          current.netProfit.toFixed(2)],
    ["Net Margin %",        current.netMargin.toFixed(2)],
    ["Order Count",         current.orderCount.toString()],
    ["Avg Order Value",     current.avgOrderValue.toFixed(2)],
    ["Avg Net Profit/Order",current.avgNetProfit.toFixed(2)],
    ["Total Refunds",       current.totalRefunds.toFixed(2)],
    ["Total Chargebacks",   current.totalChargebacks.toFixed(2)],
    ["Total Shipping Cost", current.totalShippingCost.toFixed(2)],
    ["Total Fees",          current.totalFees.toFixed(2)],
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `overview-${label.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Quick actions per role ────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  desc: string;
  icon: React.ElementType;
  href: string;
  variant?: "default" | "outline";
}

function useQuickActions(
  role: string,
  hasOrders: boolean,
  storesConnected: boolean
): QuickAction[] {
  const actions: QuickAction[] = [];

  if (role === "owner" || role === "admin") {
    if (!storesConnected) {
      actions.push({ label: "Connect a Store", desc: "Sync orders automatically from Shopify, WooCommerce, or Etsy.", icon: Store, href: "/onboarding", variant: "default" });
    } else if (!hasOrders) {
      actions.push({ label: "Import Orders", desc: "Upload a CSV to start calculating profit margins.", icon: Upload, href: "/dashboard/orders", variant: "default" });
    } else {
      actions.push({ label: "Set a Profit Goal", desc: "Track progress against a monthly profit target.", icon: Target, href: "/dashboard/goals", variant: "outline" });
      actions.push({ label: "Review Ad Spend", desc: "Check ROAS and ad efficiency across all platforms.", icon: Zap, href: "/dashboard/ad-spend", variant: "outline" });
    }
  }

  if (role === "owner") {
    actions.push({ label: "Invite Teammates", desc: "Give your team access to profit data.", icon: Users, href: "/dashboard/team", variant: "outline" });
    if (hasOrders) {
      actions.push({ label: "Generate API Key", desc: "Connect external tools via the REST API.", icon: Key, href: "/dashboard/settings/api-keys", variant: "outline" });
    }
  }

  if (role === "member" && hasOrders) {
    actions.push({ label: "Update COGS", desc: "Keep cost data accurate for better margin tracking.", icon: ShoppingCart, href: "/dashboard/products", variant: "outline" });
  }

  if (hasOrders) {
    actions.push({ label: "View P&L Statement", desc: "Full income statement for any date range.", icon: DollarSign, href: "/dashboard/pnl", variant: "outline" });
  }

  return actions;
}

// ── Main component ────────────────────────────────────────────────────────────

export function OverviewClient({ data }: { data: OverviewData }) {
  const { current, changes, chartData, stores, hasOrders } = data;
  const { role, plan, canManageBilling } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Date range — initialise from URL params or data, fall back to MTD preset
  const presets = getPresets();
  const defaultPreset = presets[0]; // "This Month"

  const [dateLabel, setDateLabel] = useState(data.dateRange?.label ?? defaultPreset.label);
  const [dateFrom,  setDateFrom]  = useState(data.dateRange?.from  ?? defaultPreset.from);
  const [dateTo,    setDateTo]    = useState(data.dateRange?.to    ?? defaultPreset.to);

  const [isPending, startTransition] = useTransition();

  const handleDateChange = (from: string, to: string, label: string) => {
    setDateFrom(from); setDateTo(to); setDateLabel(label);
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("from", from);
      params.set("to", to);
      router.push(`/dashboard?${params.toString()}`);
    });
  };

  // AI Insights
  const [insights,       setInsights]       = useState<AiInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsLoaded,  setInsightsLoaded]  = useState(false);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch("/api/ai-insights", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setInsights(json.insights ?? []);
        setInsightsLoaded(true);
      }
    } catch { /* non-fatal */ }
    finally { setInsightsLoading(false); }
  }, []);

  useEffect(() => {
    if (plan === "growth" || plan === "pro") loadInsights();
  }, [plan, loadInsights]);

  const insightIcon = (type: AiInsight["type"]) => {
    if (type === "positive") return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />;
    if (type === "warning")  return <AlertCircle  className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />;
    return <Sparkles className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />;
  };

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const syncAll = async () => {
    if (!stores.length) return;
    setSyncing(true); setSyncMsg(null);
    try {
      // Trigger sync for all connected stores in parallel
      const storesWithId = stores.filter((s) => s.id);
      if (!storesWithId.length) { setSyncMsg("No stores to sync."); return; }
      await Promise.all(
        storesWithId.map((s) =>
          fetch(`/api/stores/${s.id}/sync`, { method: "POST" }).catch(() => null)
        )
      );
      setSyncMsg("Sync started — data will update within a minute.");
      setTimeout(() => { setSyncMsg(null); router.refresh(); }, 3000);
    } catch {
      setSyncMsg("Sync failed. Try again.");
    } finally {
      setSyncing(false);
    }
  };

  const quickActions = useQuickActions(role, hasOrders, stores.length > 0);
  const storesConnected = stores.length > 0;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!storesConnected && !hasOrders && (role === "owner" || role === "admin")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Overview</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">Welcome — let&apos;s get your first data in.</p>
        </div>

        {/* Onboarding checklist (empty-state version) */}
        <OnboardingChecklist
          hasOrders={false}
          storesConnected={false}
          hasGoals={false}
          hasCogs={false}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Connect a Store",  desc: "Sync Shopify, WooCommerce, or Etsy to pull orders automatically.", href: "/onboarding",       cta: "Connect →",    primary: true  },
            { step: "2", title: "Or Import a CSV",  desc: "Upload an order export from any platform to get started immediately.", href: "/dashboard/orders", cta: "Import CSV →", primary: false },
            { step: "3", title: "Set Profit Goals", desc: "Define monthly revenue and profit targets to track progress.", href: "/dashboard/goals",  cta: "Set Goals →",  primary: false },
          ].map(({ step, title, desc, href, cta, primary }) => (
            <Link
              key={step}
              href={href}
              className={cn(
                "group relative rounded-xl border p-5 transition-all hover:shadow-md",
                primary
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
              )}
            >
              <span className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold mb-3",
                primary ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
              )}>{step}</span>
              <p className="font-semibold text-[var(--color-foreground)] mb-1">{title}</p>
              <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed mb-3">{desc}</p>
              <span className={cn(
                "text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all",
                primary ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"
              )}>{cta}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── Normal dashboard ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Sync feedback toast */}
      {syncMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <RefreshCw className="h-4 w-4 flex-shrink-0" />
          {syncMsg}
        </div>
      )}

      {/* Onboarding checklist (with-data version — shown until all steps done) */}
      <OnboardingChecklist
        hasOrders={hasOrders}
        storesConnected={storesConnected}
        hasGoals={false}   /* server could pass this; false keeps it helpful */
        hasCogs={false}
      />

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Overview</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            {dateLabel} performance
            {isPending && <span className="ml-1 animate-pulse opacity-60">· Updating…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range picker */}
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={handleDateChange}
          />

          {/* Export KPIs as CSV */}
          {hasOrders && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 text-xs"
              onClick={() => exportKpiCsv(current, dateLabel)}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          )}

          {/* Sync Now */}
          {(role === "owner" || role === "admin") && storesConnected && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8"
              onClick={syncAll}
              disabled={syncing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          )}

          {/* Upgrade nudge */}
          {role === "owner" && canManageBilling && plan !== "pro" && (
            <Link href="/pricing">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-[var(--color-primary)] border-[var(--color-primary)]/30">
                <Zap className="h-3.5 w-3.5" /> Upgrade
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Net Profit"    value={formatCurrency(current.netProfit)}    change={changes.profit}  changeLabel="vs prior period" icon={DollarSign} highlight />
        <StatCard label="Revenue"       value={formatCurrency(current.totalRevenue)} change={changes.revenue} changeLabel="vs prior period" icon={TrendingUp} />
        <StatCard label="Net Margin"    value={formatPercent(current.netMargin)}     change={changes.margin}  changeLabel="pp vs prior period" icon={Percent} />
        <StatCard label="Orders"        value={current.orderCount.toLocaleString()}  change={changes.orders}  changeLabel="vs prior period" icon={ShoppingCart} />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gross Margin",    value: formatPercent(current.grossMargin) },
          { label: "Total Ad Spend",  value: formatCurrency(current.totalAdSpend) },
          { label: "Avg Order Value", value: formatCurrency(current.avgOrderValue) },
          { label: "Total Refunds",   value: formatCurrency(current.totalRefunds), danger: current.totalRefunds > 0 },
        ].map(({ label, value, danger }) => (
          <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-muted-foreground)] mb-1">{label}</p>
            <p className={cn("text-xl font-bold", danger ? "text-red-500" : "text-[var(--color-foreground)]")}>{value}</p>
          </div>
        ))}
      </div>

      {/* Chart + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & Profit chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue & Profit — {dateLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="h-[260px] flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading chart…
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    tickLine={false} axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tickLine={false} axisLine={false}
                  />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [
                      formatCurrency(v as number),
                      name === "revenue" ? "Revenue" : "Net Profit",
                    ]}
                    labelFormatter={(l: unknown) =>
                      new Date(l as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    formatter={(v) => (
                      <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>
                        {v === "revenue" ? "Revenue" : "Net Profit"}
                      </span>
                    )}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                  <Area type="monotone" dataKey="profit"  stroke="#22c55e" strokeWidth={2} fill="url(#profGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* AI Insights panel */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--color-primary)]" /> AI Insights
              </CardTitle>
              {(plan === "growth" || plan === "pro") && (
                <Button variant="ghost" size="sm" onClick={loadInsights} disabled={insightsLoading} className="h-7 w-7 p-0">
                  <RefreshCw className={cn("h-3.5 w-3.5", insightsLoading && "animate-spin")} />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {plan !== "growth" && plan !== "pro" ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-6">
                <Sparkles className="h-8 w-8 text-[var(--color-border)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">AI Insights</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Unlock AI-powered analysis of your profit trends.</p>
                </div>
                {canManageBilling && (
                  <Link href="/pricing">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                      <Zap className="h-3 w-3" /> Upgrade to Growth
                    </Button>
                  </Link>
                )}
              </div>
            ) : insightsLoading && !insightsLoaded ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-[var(--color-muted)] animate-pulse" />)}
              </div>
            ) : !insights.length ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-sm text-[var(--color-muted-foreground)]">
                <Sparkles className="h-6 w-6 mb-2 opacity-40" />
                <p>Import orders to generate AI insights.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border p-3 text-sm",
                      ins.type === "positive" && "bg-green-50  border-green-200  dark:bg-green-950  dark:border-green-800",
                      ins.type === "warning"  && "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800",
                      ins.type === "info"     && "bg-blue-50   border-blue-200   dark:bg-blue-950   dark:border-blue-800"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {insightIcon(ins.type)}
                      <div>
                        <p className="font-semibold text-[var(--color-foreground)] mb-0.5">{ins.title}</p>
                        <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">{ins.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      {quickActions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map(({ label, desc, icon: Icon, href, variant }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-sm",
                  variant === "default"
                    ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30"
                )}
              >
                <span className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 mt-0.5",
                  variant === "default"
                    ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                    : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-1 group-hover:text-[var(--color-primary)] transition-colors">
                    {label}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity -ml-0.5" />
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Connected stores */}
      {stores.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Connected Stores</CardTitle>
              {(role === "owner" || role === "admin") && (
                <Link href="/dashboard/settings" className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1">
                  Manage <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stores.map((store, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{platformIcon[store.platform] ?? "🏪"}</span>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-foreground)]">{store.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)] capitalize">
                        {store.platform.replace("_", " ")}
                        {store.lastSyncAt && ` · ${new Date(store.lastSyncAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  {syncBadge(store.syncStatus)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
