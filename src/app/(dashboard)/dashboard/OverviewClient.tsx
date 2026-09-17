"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Bar, Line,
  Cell, PieChart, Pie,
} from "recharts";
import {
  DollarSign, TrendingUp, ShoppingCart, Percent,
  Sparkles, RefreshCw, AlertCircle, CheckCircle2,
  Store, Target,
  Zap, Download, Calendar, ChevronDown,
  CheckSquare, Square, BarChart3, Package,
  ArrowUpRight, ArrowDownRight, Minus,
  ReceiptText, CreditCard, Truck, Megaphone,
  BadgePercent, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import { useCurrency } from "@/components/dashboard/CurrencyContext";
import type { PeriodSummary } from "@/lib/profit-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiInsight {
  type: "positive" | "warning" | "info";
  title: string;
  body: string;
}

interface ChartPoint {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
  adSpend: number;
  cogs: number;
}

interface CostBreakdown {
  grossRevenue: number;
  totalGrossRevenue: number;
  discounts: number;
  refunds: number;
  chargebacks: number;
  cogs: number;
  shippingCost: number;
  shippingRevenue: number;
  transactionFees: number;
  adSpend: number;
  taxes: number;
  netProfit: number;
  totalCosts: number;
  roas: number;
  netRevenue: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  grossRevenue: number;
  netProfit: number;
  profitMargin: number;
  status: string;
  customerEmail: string | null;
}

interface StoreInfo {
  id: string;
  name: string;
  platform: string;
  syncStatus: string;
  lastSyncAt?: string;
  ordersCount: number;
}

interface GoalProgress {
  label: string;
  target: number;
  current: number;
  pct: number;
  type: string;
}

interface OverviewData {
  current: PeriodSummary;
  last: PeriodSummary;
  changes: {
    revenue: number; profit: number; margin: number; orders: number;
    adSpend: number; cogs: number; refunds: number; aov: number;
  };
  chartData: ChartPoint[];
  costBreakdown: CostBreakdown;
  statusMap: Record<string, { count: number; revenue: number }>;
  recentOrders: RecentOrder[];
  stores: StoreInfo[];
  goalProgress: GoalProgress | null;
  hasOrders: boolean;
  totalOrdersInPeriod: number;
  dateRange?: { from: string; to: string; label: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ICON: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🔧", etsy: "🧶", csv_manual: "📄",
};

const STATUS_COLOR: Record<string, string> = {
  fulfilled: "text-green-600 dark:text-green-400",
  pending:   "text-yellow-600 dark:text-yellow-400",
  refunded:  "text-red-500",
  cancelled: "text-[var(--color-muted-foreground)]",
};

const STATUS_BG: Record<string, string> = {
  fulfilled: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
  pending:   "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800",
  refunded:  "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  cancelled: "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateFull(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function DeltaBadge({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) return (
    <span className="flex items-center gap-0.5 text-xs text-[var(--color-muted-foreground)]">
      <Minus className="h-3 w-3" />0{suffix}
    </span>
  );
  const pos = value > 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-medium", pos ? "text-green-600 dark:text-green-400" : "text-red-500")}>
      {pos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pos ? "+" : ""}{value.toFixed(1)}{suffix}
    </span>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────

interface DatePreset { label: string; from: string; to: string }

function getPresets(): DatePreset[] {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  return [
    { label: "Last 30 Days", from: fmt(new Date(Date.now() - 29 * 86400_000)),               to: today },
    { label: "This Month",   from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),      to: today },
    { label: "Last Month",   from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),  to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) },
    { label: "Last 7 Days",  from: fmt(new Date(Date.now() -  6 * 86400_000)),               to: today },
    { label: "Year to Date", from: fmt(new Date(now.getFullYear(), 0, 1)),                   to: today },
    { label: "Last Year",    from: fmt(new Date(now.getFullYear() - 1, 0, 1)),               to: fmt(new Date(now.getFullYear() - 1, 11, 31)) },
    { label: "All Time",     from: "2000-01-01",                                             to: today },
  ];
}

function DateRangePicker({ from, to, onApply }: {
  from: string; to: string;
  onApply: (from: string, to: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lFrom, setLFrom] = useState(from);
  const [lTo,   setLTo]   = useState(to);
  const presets = getPresets();
  const active  = presets.find((p) => p.from === from && p.to === to);

  const apply = (f: string, t: string, label: string) => {
    setLFrom(f); setLTo(t); onApply(f, t, label); setOpen(false);
  };

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setOpen(!open)}>
        <Calendar className="h-3.5 w-3.5" />
        {active?.label ?? `${from} → ${to}`}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-3 space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {presets.map((p) => (
                <button key={p.label} onClick={() => apply(p.from, p.to, p.label)}
                  className={cn("text-xs px-3 py-1.5 rounded-lg text-left transition-colors",
                    from === p.from && to === p.to
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 text-[var(--color-foreground)]"
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border-t border-[var(--color-border)] pt-2 space-y-2">
              <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Custom range</p>
              <div className="flex items-center gap-1.5">
                <input type="date" value={lFrom} onChange={(e) => setLFrom(e.target.value)}
                  className="flex-1 h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs" />
                <span className="text-xs text-[var(--color-muted-foreground)]">–</span>
                <input type="date" value={lTo} onChange={(e) => setLTo(e.target.value)}
                  className="flex-1 h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs" />
              </div>
              <Button size="sm" className="w-full h-7 text-xs" onClick={() => apply(lFrom, lTo, `${lFrom} → ${lTo}`)}
                disabled={!lFrom || !lTo || lFrom > lTo}>
                Apply
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Onboarding Checklist ─────────────────────────────────────────────────────

function OnboardingChecklist({ hasOrders, storesConnected, hasGoals, hasCogs }: {
  hasOrders: boolean; storesConnected: boolean; hasGoals: boolean; hasCogs: boolean;
}) {
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("overview_checklist_dismissed") === "1"
  );

  const items = [
    { id: "store",  label: "Connect a store",          desc: "Sync Shopify, WooCommerce, or Etsy", href: "/onboarding",          done: storesConnected },
    { id: "orders", label: "Import your first orders", desc: "Upload CSV or sync from your store", href: "/dashboard/orders",    done: hasOrders },
    { id: "cogs",   label: "Set product COGS",          desc: "Accurate margins need accurate costs", href: "/dashboard/products", done: hasCogs },
    { id: "goals",  label: "Set a profit goal",         desc: "Track monthly progress at a glance",  href: "/dashboard/goals",    done: hasGoals },
  ];

  const done = items.filter((i) => i.done).length;
  if (dismissed || done === items.length) return null;

  return (
    <Card className="border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">Getting Started</CardTitle>
            <span className="text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full font-medium">
              {done}/{items.length}
            </span>
          </div>
          <button onClick={() => { setDismissed(true); localStorage.setItem("overview_checklist_dismissed", "1"); }}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            Dismiss
          </button>
        </div>
        <div className="h-1 rounded-full bg-[var(--color-border)] mt-2 overflow-hidden">
          <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
            style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {items.map(({ id, label, desc, href, done: d }) => (
            <Link key={id} href={d ? "#" : href} onClick={d ? (e) => e.preventDefault() : undefined}
              className={cn("flex items-start gap-2 p-2.5 rounded-lg border text-xs transition-all",
                d ? "border-green-200 bg-green-50/50 dark:bg-green-950/30 dark:border-green-900 cursor-default"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5")}>
              {d ? <CheckSquare className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                 : <Square className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] flex-shrink-0 mt-0.5" />}
              <div>
                <p className={cn("font-medium leading-tight", d ? "line-through text-[var(--color-muted-foreground)]" : "text-[var(--color-foreground)]")}>{label}</p>
                <p className="text-[var(--color-muted-foreground)] mt-0.5 leading-snug">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Waterfall Row ────────────────────────────────────────────────────────────

function WaterfallRow({
  label, value, total, icon: Icon, color, currency, isPositive = true,
}: {
  label: string; value: number; total: number;
  icon: React.ElementType; color: string; currency: string; isPositive?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, (Math.abs(value) / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg", color)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs text-[var(--color-muted-foreground)]">{label}</span>
          <span className={cn("text-xs font-semibold tabular-nums", !isPositive && value > 0 ? "text-red-500" : "text-[var(--color-foreground)]")}>
            {!isPositive && value > 0 ? "−" : ""}{formatCurrency(Math.abs(value), currency)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", isPositive ? "bg-[var(--color-primary)]" : "bg-red-400")}
            style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Metric Mini Card ─────────────────────────────────────────────────────────

function MiniCard({ label, value, change, danger, warning }: {
  label: string; value: string; change?: number; danger?: boolean; warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 flex flex-col gap-2">
      <p className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wide">{label}</p>
      <p className={cn("text-xl font-bold tracking-tight",
        danger ? "text-red-500" : warning ? "text-yellow-600 dark:text-yellow-400" : "text-[var(--color-foreground)]")}>
        {value}
      </p>
      {change !== undefined && <DeltaBadge value={change} />}
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportKpiCsv(current: PeriodSummary, cb: CostBreakdown, label: string, totalOrders: number) {
  const rows = [
    ["Metric", "Value"],
    ["Period",                   label],
    ["Gross Revenue",            cb.grossRevenue.toFixed(2)],
    ["Discounts",                cb.discounts.toFixed(2)],
    ["Refunds",                  cb.refunds.toFixed(2)],
    ["Chargebacks",              cb.chargebacks.toFixed(2)],
    ["Net Revenue",              cb.netRevenue.toFixed(2)],
    ["Total COGS",               current.totalCogs.toFixed(2)],
    ["Gross Profit",             current.grossProfit.toFixed(2)],
    ["Gross Margin %",           current.grossMargin.toFixed(2)],
    ["Shipping Cost",            current.totalShippingCost.toFixed(2)],
    ["Transaction Fees",         current.totalFees.toFixed(2)],
    ["Total Ad Spend",           current.totalAdSpend.toFixed(2)],
    ["ROAS",                     cb.roas.toFixed(2)],
    ["Net Profit",               current.netProfit.toFixed(2)],
    ["Net Margin %",             current.netMargin.toFixed(2)],
    ["Order Count (all)",        totalOrders.toString()],
    ["Order Count (excl. cancelled)", current.orderCount.toString()],
    ["Avg Order Value",          current.avgOrderValue.toFixed(2)],
    ["Avg Net Profit / Order",   current.avgNetProfit.toFixed(2)],
    ["Total Refunds",            current.totalRefunds.toFixed(2)],
    ["Total Chargebacks",        current.totalChargebacks.toFixed(2)],
    ["Total Shipping Cost",      current.totalShippingCost.toFixed(2)],
    ["Total Fees",               current.totalFees.toFixed(2)],
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `overview-${label.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-[var(--color-foreground)] border-b border-[var(--color-border)] pb-1 mb-1">
        {label ? fmtDate(label) : ""}
      </p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            {p.name === "revenue" ? "Revenue" : p.name === "profit" ? "Net Profit"
              : p.name === "adSpend" ? "Ad Spend" : p.name === "cogs" ? "COGS"
              : p.name === "orders" ? "Orders" : p.name}
          </span>
          <span className="font-semibold text-[var(--color-foreground)] tabular-nums">
            {p.name === "orders" ? p.value.toLocaleString() : formatCurrency(p.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OverviewClient({ data }: { data: OverviewData }) {
  const {
    current, changes, chartData, costBreakdown: cb,
    statusMap, recentOrders, stores, goalProgress, hasOrders,
    totalOrdersInPeriod,
  } = data;

  const { plan, canManageBilling } = useRole();
  const { currency } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();

  const presets = getPresets();
  const defaultPreset = presets.find((p) => p.label === "Last 30 Days") ?? presets[0];
  const [dateLabel, setDateLabel] = useState(data.dateRange?.label ?? defaultPreset.label);
  const [dateFrom,  setDateFrom]  = useState(data.dateRange?.from  ?? defaultPreset.from);
  const [dateTo,    setDateTo]    = useState(data.dateRange?.to    ?? defaultPreset.to);
  const [isPending, startTransition] = useTransition();
  const [activeChart, setActiveChart] = useState<"area" | "bars">("area");

  const handleDateChange = (from: string, to: string, label: string) => {
    setDateFrom(from); setDateTo(to); setDateLabel(label);
    startTransition(() => {
      const p = new URLSearchParams(searchParams?.toString() ?? "");
      p.set("from", from); p.set("to", to); p.set("label", label);
      router.push(`/dashboard?${p.toString()}`);
    });
  };

  // ── AI Insights ────────────────────────────────────────────────────────────
  const [insights,        setInsights]        = useState<AiInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsLoaded,  setInsightsLoaded]  = useState(false);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch("/api/ai-insights", { method: "POST" });
      if (res.ok) { const j = await res.json(); setInsights(j.insights ?? []); setInsightsLoaded(true); }
    } catch { /* non-fatal */ } finally { setInsightsLoading(false); }
  }, []);

  useEffect(() => {
    if (plan === "growth" || plan === "pro") loadInsights();
  }, [plan, loadInsights]);

  // ── Sync ───────────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const syncAll = async () => {
    if (!stores.length) return;
    setSyncing(true); setSyncMsg(null);
    try {
      await Promise.all(stores.map((s) => fetch(`/api/stores/${s.id}/sync`, { method: "POST" }).catch(() => null)));
      setSyncMsg("Sync started — data will update within a minute.");
      setTimeout(() => { setSyncMsg(null); router.refresh(); }, 3500);
    } catch { setSyncMsg("Sync failed. Please try again."); } finally { setSyncing(false); }
  };

  const storesConnected = stores.length > 0;

  // ── Cost pie data ──────────────────────────────────────────────────────────
  const pieData = [
    { name: "COGS",         value: cb.cogs,            color: "#3b82f6" },
    { name: "Ad Spend",     value: cb.adSpend,         color: "#8b5cf6" },
    { name: "Shipping",     value: cb.shippingCost,    color: "#f59e0b" },
    { name: "Fees",         value: cb.transactionFees, color: "#ec4899" },
    { name: "Net Profit",   value: Math.max(0, cb.netProfit), color: "#22c55e" },
  ].filter((d) => d.value > 0);

  // ── Empty State ────────────────────────────────────────────────────────────
  if (!storesConnected && !hasOrders) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Overview</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            Welcome — connect a store or import orders to get started.
          </p>
        </div>
        <OnboardingChecklist hasOrders={false} storesConnected={false} hasGoals={false} hasCogs={false} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Connect a Store",   desc: "Pull orders automatically from Shopify, WooCommerce, or Etsy.", href: "/onboarding",       cta: "Connect now",   primary: true  },
            { step: "2", title: "Import via CSV",     desc: "Upload any order export file and start seeing profit data.",    href: "/dashboard/orders", cta: "Import CSV",    primary: false },
            { step: "3", title: "Set Profit Goals",   desc: "Define monthly targets and track progress against them.",       href: "/dashboard/goals",  cta: "Set goals",     primary: false },
          ].map(({ step, title, desc, href, cta, primary }) => (
            <Link key={step} href={href}
              className={cn("group relative rounded-xl border p-5 transition-all hover:shadow-md",
                primary ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                        : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40")}>
              <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold mb-3",
                primary ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]")}>
                {step}
              </span>
              <p className="font-semibold text-[var(--color-foreground)] mb-1">{title}</p>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-3 leading-relaxed">{desc}</p>
              <span className={cn("text-sm font-medium", primary ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]")}>
                {cta} →
              </span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── Full Dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Sync toast */}
      {syncMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <RefreshCw className="h-4 w-4 flex-shrink-0" />{syncMsg}
        </div>
      )}

      {/* Onboarding checklist */}
      <OnboardingChecklist
        hasOrders={hasOrders} storesConnected={storesConnected}
        hasGoals={!!goalProgress} hasCogs={false}
      />

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Overview</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            {dateLabel}
            {isPending && <span className="ml-1.5 animate-pulse opacity-60">· Updating…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={handleDateChange} />
          {hasOrders && (
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
              onClick={() => exportKpiCsv(current, cb, dateLabel, totalOrdersInPeriod)}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
          {storesConnected && (
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={syncAll} disabled={syncing}>
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync"}
            </Button>
          )}
          {canManageBilling && plan !== "pro" && (
            <Link href="/pricing">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-[var(--color-primary)] border-[var(--color-primary)]/40">
                <Zap className="h-3.5 w-3.5" /> Upgrade
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── No data in range nudge ── */}
      {hasOrders && totalOrdersInPeriod === 0 && !isPending && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/50 px-4 py-3 text-sm">
          <span className="text-yellow-500 mt-0.5 flex-shrink-0">⚠️</span>
          <div>
            <p className="font-semibold text-yellow-800 dark:text-yellow-300">No orders found in this date range</p>
            <p className="text-yellow-700 dark:text-yellow-400 mt-0.5">
              Your orders exist but fall outside <strong>{dateLabel}</strong>.
              Try <button
                onClick={() => {
                  const p = getPresets().find(x => x.label === "All Time") ??
                    { label: "All Time", from: "2000-01-01", to: new Date().toISOString().slice(0, 10) };
                  handleDateChange(p.from, p.to, "All Time");
                }}
                className="underline font-medium hover:text-yellow-900 dark:hover:text-yellow-200"
              >All Time</button> or pick a wider range.
            </p>
          </div>
        </div>
      )}

      {/* ── Primary KPI row (4 hero cards) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Net Profit"
          value={formatCurrency(current.netProfit, currency)}
          change={changes.profit}
          changeLabel="vs prior period"
          icon={DollarSign}
          highlight
        />
        <StatCard
          label="Revenue"
          value={formatCurrency(current.totalRevenue, currency)}
          change={changes.revenue}
          changeLabel="vs prior period"
          icon={TrendingUp}
        />
        <StatCard
          label="Net Margin"
          value={formatPercent(current.netMargin)}
          change={changes.margin}
          changeLabel="pp vs prior"
          icon={Percent}
        />
        <StatCard
          label="Total Orders"
          value={totalOrdersInPeriod.toLocaleString()}
          change={changes.orders}
          changeLabel="vs prior period"
          icon={ShoppingCart}
        />
      </div>

      {/* ── Secondary KPI row (8 mini cards) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <MiniCard label="Gross Margin"    value={formatPercent(current.grossMargin)}          change={undefined} />
        <MiniCard label="Avg Order Value" value={formatCurrency(current.avgOrderValue, currency)} change={changes.aov} />
        <MiniCard label="Avg Net Profit"  value={formatCurrency(current.avgNetProfit, currency)} />
        <MiniCard label="Total Ad Spend"  value={formatCurrency(current.totalAdSpend, currency)} change={changes.adSpend} />
        <MiniCard label="Gross Profit"    value={formatCurrency(current.grossProfit, currency)} />
        <MiniCard label="Total COGS"      value={formatCurrency(current.totalCogs, currency)}    change={changes.cogs} />
        <MiniCard label="Total Refunds"   value={formatCurrency(current.totalRefunds, currency)} change={changes.refunds} danger={current.totalRefunds > 0} />
        <MiniCard label="ROAS"
          value={cb.roas > 0 ? `${cb.roas.toFixed(2)}×` : "—"}
          warning={cb.roas > 0 && cb.roas < 2}
        />
      </div>

      {/* ── Goal progress ── */}
      {goalProgress && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[var(--color-primary)]" />
                <span className="text-sm font-semibold text-[var(--color-foreground)]">{goalProgress.label}</span>
                <Badge variant={goalProgress.pct >= 100 ? "success" : "outline"} className="text-xs">
                  {goalProgress.pct >= 100 ? "✓ Achieved" : `${goalProgress.pct.toFixed(0)}%`}
                </Badge>
              </div>
              <div className="text-right text-xs text-[var(--color-muted-foreground)]">
                <span className="font-semibold text-[var(--color-foreground)]">{formatCurrency(goalProgress.current, currency)}</span>
                {" / "}{formatCurrency(goalProgress.target, currency)}
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700",
                  goalProgress.pct >= 100 ? "bg-green-500" : goalProgress.pct >= 70 ? "bg-[var(--color-primary)]" : "bg-yellow-500")}
                style={{ width: `${Math.min(100, goalProgress.pct)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1.5">
              {goalProgress.pct >= 100
                ? `Goal reached! You're ${formatCurrency(goalProgress.current - goalProgress.target, currency)} above target.`
                : `${formatCurrency(goalProgress.target - goalProgress.current, currency)} remaining to hit your ${dateLabel.toLowerCase()} target.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Main chart ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Performance — {dateLabel}</CardTitle>
            <div className="flex items-center gap-1">
              <button onClick={() => setActiveChart("area")}
                className={cn("text-xs px-2.5 py-1 rounded-lg transition-colors",
                  activeChart === "area" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]")}>
                Area
              </button>
              <button onClick={() => setActiveChart("bars")}
                className={cn("text-xs px-2.5 py-1 rounded-lg transition-colors",
                  activeChart === "bars" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]")}>
                Bars
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="h-[280px] flex items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Updating…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              {activeChart === "area" ? (
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev"  x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gProf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAds"  x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<ChartTooltip currency={currency} />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>{v === "revenue" ? "Revenue" : v === "profit" ? "Net Profit" : "Ad Spend"}</span>} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#gRev)"  dot={false} />
                  <Area type="monotone" dataKey="profit"  stroke="#22c55e" strokeWidth={2} fill="url(#gProf)" dot={false} />
                  <Area type="monotone" dataKey="adSpend" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#gAds)" dot={false} />
                </AreaChart>
              ) : (
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} tickLine={false} axisLine={false} width={48} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip content={<ChartTooltip currency={currency} />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>{v === "revenue" ? "Revenue" : v === "profit" ? "Net Profit" : "Orders"}</span>} />
                  <Bar yAxisId="left"  dataKey="revenue" fill="#3b82f6" fillOpacity={0.8} radius={[3,3,0,0]} maxBarSize={24} />
                  <Bar yAxisId="left"  dataKey="profit"  fill="#22c55e" fillOpacity={0.8} radius={[3,3,0,0]} maxBarSize={24} />
                  <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Middle row: Cost breakdown + Pie + Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Waterfall / cost breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-[var(--color-primary)]" />
              Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <WaterfallRow label="Gross Revenue"     value={cb.grossRevenue}     total={cb.grossRevenue} icon={TrendingUp}   color="bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400"   currency={currency} />
            <WaterfallRow label="Discounts"          value={cb.discounts}        total={cb.grossRevenue} icon={BadgePercent} color="bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400" currency={currency} isPositive={false} />
            <WaterfallRow label="Refunds"            value={cb.refunds}          total={cb.grossRevenue} icon={RotateCcw}    color="bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"         currency={currency} isPositive={false} />
            <div className="border-t border-[var(--color-border)] pt-2 pb-1">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-foreground)]">
                <span>Net Revenue</span>
                <span className="tabular-nums">{formatCurrency(cb.netRevenue, currency)}</span>
              </div>
            </div>
            <WaterfallRow label="COGS"               value={cb.cogs}             total={cb.grossRevenue} icon={Package}  color="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"   currency={currency} isPositive={false} />
            <WaterfallRow label="Shipping Cost"      value={cb.shippingCost}     total={cb.grossRevenue} icon={Truck}    color="bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"   currency={currency} isPositive={false} />
            <WaterfallRow label="Transaction Fees"   value={cb.transactionFees}  total={cb.grossRevenue} icon={CreditCard} color="bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400"    currency={currency} isPositive={false} />
            <WaterfallRow label="Ad Spend"           value={cb.adSpend}          total={cb.grossRevenue} icon={Megaphone} color="bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400" currency={currency} isPositive={false} />
            <div className="border-t border-[var(--color-border)] pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--color-foreground)]">Net Profit</span>
                <span className={cn("text-sm font-bold tabular-nums", cb.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500")}>
                  {formatCurrency(cb.netProfit, currency)}
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                Net margin: <strong>{formatPercent(current.netMargin)}</strong>
                {cb.roas > 0 && <> · ROAS: <strong>{cb.roas.toFixed(2)}×</strong></>}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cost mix pie + status */}
        <div className="space-y-4">
          {/* Cost pie */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[var(--color-primary)]" />
                Cost Mix
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                        dataKey="value" paddingAngle={2} strokeWidth={0}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: unknown, n: unknown) => [formatCurrency(v as number, currency), n as string]}
                        contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                    {pieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-[var(--color-muted-foreground)] truncate">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-center text-[var(--color-muted-foreground)] py-8">No cost data yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Order status split */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Order Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {(["fulfilled", "pending", "refunded", "cancelled"] as const).map((s) => {
                const info = statusMap[s];
                if (!info?.count) return null;
                return (
                  <div key={s} className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-xs", STATUS_BG[s])}>
                    <span className={cn("font-medium capitalize", STATUS_COLOR[s])}>{s}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-muted-foreground)]">{info.count} orders</span>
                      <span className="font-semibold text-[var(--color-foreground)] tabular-nums">
                        {formatCurrency(info.revenue, currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {Object.keys(statusMap).length === 0 && (
                <p className="text-xs text-center text-[var(--color-muted-foreground)] py-4">No orders in this period.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Bottom row: Recent orders + AI Insights + Stores ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent orders */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Orders</CardTitle>
              <Link href="/dashboard/orders">
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-[var(--color-primary)]">
                  View all <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-center text-[var(--color-muted-foreground)] py-8">No orders in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {["Order", "Date", "Revenue", "Net Profit", "Margin", "Status"].map((h) => (
                        <th key={h} className="pb-2 text-left font-semibold text-[var(--color-muted-foreground)] pr-4 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-[var(--color-muted)]/50 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-[var(--color-foreground)]">
                          #{o.orderNumber}
                          {o.customerEmail && (
                            <p className="text-[var(--color-muted-foreground)] font-normal truncate max-w-[120px]">{o.customerEmail}</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-[var(--color-muted-foreground)] whitespace-nowrap">{fmtDateFull(o.orderDate)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{formatCurrency(o.grossRevenue, currency)}</td>
                        <td className={cn("py-2.5 pr-4 font-semibold tabular-nums", o.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500")}>
                          {formatCurrency(o.netProfit, currency)}
                        </td>
                        <td className={cn("py-2.5 pr-4 tabular-nums",
                          o.profitMargin >= 20 ? "text-green-600 dark:text-green-400"
                          : o.profitMargin >= 10 ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-500")}>
                          {formatPercent(o.profitMargin, 1)}
                        </td>
                        <td className="py-2.5">
                          <span className={cn("px-2 py-0.5 rounded-full capitalize font-medium border", STATUS_BG[o.status] ?? "", STATUS_COLOR[o.status] ?? "")}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Insights + Stores stacked */}
        <div className="space-y-4">

          {/* AI Insights */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--color-primary)]" /> AI Insights
                </CardTitle>
                {(plan === "growth" || plan === "pro") && (
                  <Button variant="ghost" size="sm" onClick={loadInsights} disabled={insightsLoading} className="h-6 w-6 p-0">
                    <RefreshCw className={cn("h-3.5 w-3.5", insightsLoading && "animate-spin")} />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {plan !== "growth" && plan !== "pro" ? (
                <div className="flex flex-col items-center text-center gap-2 py-4">
                  <Sparkles className="h-7 w-7 text-[var(--color-border)]" />
                  <p className="text-xs text-[var(--color-muted-foreground)]">Unlock AI analysis of your profit trends.</p>
                  {canManageBilling && (
                    <Link href="/pricing">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                        <Zap className="h-3 w-3" /> Upgrade
                      </Button>
                    </Link>
                  )}
                </div>
              ) : insightsLoading && !insightsLoaded ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-[var(--color-muted)] animate-pulse" />)}
                </div>
              ) : !insights.length ? (
                <p className="text-xs text-center text-[var(--color-muted-foreground)] py-4">No insights yet — import orders first.</p>
              ) : (
                <div className="space-y-2">
                  {insights.slice(0, 4).map((ins, i) => (
                    <div key={i} className={cn("rounded-lg border p-2.5 text-xs",
                      ins.type === "positive" ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                      : ins.type === "warning"  ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800"
                      : "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800")}>
                      <div className="flex items-start gap-2">
                        {ins.type === "positive" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                          : ins.type === "warning" ? <AlertCircle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                          : <Sparkles className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />}
                        <div>
                          <p className="font-semibold text-[var(--color-foreground)]">{ins.title}</p>
                          <p className="text-[var(--color-muted-foreground)] mt-0.5 leading-snug">{ins.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connected stores */}
          {storesConnected && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Store className="h-4 w-4 text-[var(--color-primary)]" /> Stores
                  </CardTitle>
                  <Link href="/onboarding">
                    <Button variant="ghost" size="sm" className="text-xs h-6 gap-1 text-[var(--color-primary)]">
                      Add <ArrowUpRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {stores.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[var(--color-border)] last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base leading-none flex-shrink-0">{PLATFORM_ICON[s.platform] ?? "🏪"}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--color-foreground)] truncate">{s.name}</p>
                        <p className="text-[var(--color-muted-foreground)]">
                          {s.ordersCount.toLocaleString()} orders
                          {s.lastSyncAt && <> · {fmtDateFull(s.lastSyncAt)}</>}
                        </p>
                      </div>
                    </div>
                    {s.syncStatus === "idle"    && <Badge variant="success"     className="text-xs flex-shrink-0">Synced</Badge>}
                    {s.syncStatus === "syncing" && <Badge variant="outline"     className="text-xs flex-shrink-0 animate-pulse">Syncing</Badge>}
                    {s.syncStatus === "error"   && <Badge variant="destructive" className="text-xs flex-shrink-0">Error</Badge>}
                    {s.syncStatus === "never"   && <Badge variant="outline"     className="text-xs flex-shrink-0">Never synced</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "P&L Statement", icon: ReceiptText, href: "/dashboard/pnl", desc: "Full income statement" },
            { label: "Ad Spend",      icon: Megaphone,   href: "/dashboard/ad-spend", desc: "ROAS & efficiency" },
            { label: "Products",      icon: Package,     href: "/dashboard/products", desc: "Set COGS & margins" },
            { label: "Goals",         icon: Target,      href: "/dashboard/goals", desc: "Track targets" },
          ].map(({ label, icon: Icon, href, desc }) => (
            <Link key={href} href={href}
              className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-all">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)] text-[var(--color-muted-foreground)] group-hover:bg-[var(--color-primary)]/15 group-hover:text-[var(--color-primary)] transition-colors">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">{label}</p>
                <p className="text-xs text-[var(--color-muted-foreground)] truncate">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
