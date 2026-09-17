"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
  LineChart, Line, Legend,
} from "recharts";
import {
  Users, TrendingUp, RefreshCw, Award, AlertTriangle,
  Crown, Download, BarChart3, Activity, ShieldAlert,
  ChevronUp, ChevronDown, Minus,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CohortRow {
  cohort: string; customers: number; revenue: number; profit: number;
  repeatCustomers: number; avgLtv: number; repeatRate: number;
  avgRevPerCustomer: number; avgOrdersPerCustomer: number;
}

interface CustomerRow {
  email: string; orderCount: number; totalRevenue: number; totalProfit: number;
  avgOrderValue: number; firstOrderDate: string; lastOrderDate: string;
  daysSinceFirst: number; daysSinceLast: number;
  estimatedAnnualLtv: number; churnRisk: "low" | "medium" | "high";
}

interface TrendPoint {
  month: string; revenue: number; profit: number;
  activeCustomers: number; avgOrderValue: number;
}

interface FreqBucket {
  label: string; customers: number; pct: number;
}

interface LtvData {
  cohorts: CohortRow[];
  topCustomers: CustomerRow[];
  trend: TrendPoint[];
  frequency: FreqBucket[];
  summary: {
    totalCustomers: number; repeatCustomers: number; repeatRate: number;
    avgLtv: number; avgRevLtv: number; avgOrdersPerCust: number;
    top20pctPct: number; atRiskCount: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(m: unknown): string {
  return new Date(String(m) + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <Minus className="h-3 w-3 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-[var(--color-primary)]" />
    : <ChevronDown className="h-3 w-3 text-[var(--color-primary)]" />;
}

const CHURN_STYLE: Record<string, { badge: string; label: string }> = {
  low:    { badge: "success",     label: "Active"    },
  medium: { badge: "warning",     label: "At Risk"   },
  high:   { badge: "destructive", label: "Churning"  },
};

const FREQ_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6"];

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCsv(topCustomers: CustomerRow[], currency: string) {
  const headers = ["Rank","Email","Orders","Total Revenue","Profit LTV","Est. Annual LTV","Avg Order Value","First Order","Last Order","Days Since Last","Churn Risk"];
  const rows = topCustomers.map((c, i) => [
    i + 1, c.email, c.orderCount,
    c.totalRevenue.toFixed(2), c.totalProfit.toFixed(2),
    c.estimatedAnnualLtv.toFixed(2), c.avgOrderValue.toFixed(2),
    fmtDate(c.firstOrderDate), fmtDate(c.lastOrderDate),
    c.daysSinceLast, c.churnRisk,
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "customer-ltv.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTip({ active, payload, label, currency, isMonth = false }: any) {
  if (!active || !payload?.length) return null;
  const title = isMonth && label ? fmtMonth(label) : (label ?? "");
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-[var(--color-foreground)] border-b border-[var(--color-border)] pb-1 mb-1">{title}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums text-[var(--color-foreground)]">
            {typeof p.value === "number" && p.name !== "Customers" && p.name !== "Repeat Rate"
              ? p.name === "Repeat Rate" ? `${p.value.toFixed(1)}%` : formatCurrency(p.value, currency)
              : p.name === "Repeat Rate" ? `${p.value.toFixed(1)}%`
              : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LtvClient({ data }: { data: LtvData }) {
  const { cohorts, topCustomers, trend, frequency, summary } = data;
  const { currency } = useCurrency();
  const hasCohorts  = cohorts.length > 0;
  const hasCustomers = topCustomers.length > 0;

  // Table sorting
  type SortKey = keyof CustomerRow;
  const [sortKey, setSortKey]   = useState<SortKey>("totalProfit");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");
  const [riskFilter, setRisk]   = useState<"all" | "medium" | "high">("all");
  const [activeTab, setActiveTab] = useState<"cohorts" | "customers" | "frequency">("cohorts");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedCustomers = [...topCustomers]
    .filter((c) => riskFilter === "all" || c.churnRisk === riskFilter)
    .sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const maxLtv = Math.max(...cohorts.map((c) => c.avgLtv), 1);

  const ThCol = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className={cn("px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] cursor-pointer select-none whitespace-nowrap group", className)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon active={sortKey === k} dir={sortDir} />
      </span>
    </th>
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasCohorts) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Customer LTV</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">Lifetime value, cohort analysis & purchase behaviour.</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] py-24 text-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-muted)]">
            <Users className="h-8 w-8 text-[var(--color-muted-foreground)] opacity-50" />
          </span>
          <div>
            <p className="text-base font-semibold text-[var(--color-foreground)]">No customer data yet</p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1 max-w-sm">
              Import orders that include a <code className="font-mono bg-[var(--color-muted)] px-1 rounded">customer_email</code> column to unlock cohort analysis and LTV insights.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Full dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Customer LTV</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Lifetime value, cohort retention & purchase behaviour.
            </p>
          </div>
        </div>
        {hasCustomers && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCsv(topCustomers, currency)}>
            <Download className="h-4 w-4" /> Export Customers
          </Button>
        )}
      </div>

      {/* ── Primary KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Customers"
          value={summary.totalCustomers.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Avg Profit LTV"
          value={formatCurrency(summary.avgLtv, currency)}
          icon={TrendingUp}
          highlight
        />
        <StatCard
          label="Repeat Purchase Rate"
          value={formatPercent(summary.repeatRate)}
          icon={RefreshCw}
        />
        <StatCard
          label="Avg Orders / Customer"
          value={summary.avgOrdersPerCust.toFixed(2)}
          icon={Award}
        />
      </div>

      {/* ── Secondary insight strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Avg Revenue LTV",
            value: formatCurrency(summary.avgRevLtv, currency),
            icon: BarChart3,
            color: "text-blue-500",
            bg:    "bg-blue-50 dark:bg-blue-950/50",
          },
          {
            label: "Repeat Customers",
            value: summary.repeatCustomers.toLocaleString(),
            icon: RefreshCw,
            color: "text-green-600",
            bg:    "bg-green-50 dark:bg-green-950/50",
          },
          {
            label: "Top 20% Revenue Share",
            value: formatPercent(summary.top20pctPct),
            icon: Crown,
            color: "text-amber-500",
            bg:    "bg-amber-50 dark:bg-amber-950/50",
          },
          {
            label: "Churn Risk Customers",
            value: summary.atRiskCount.toLocaleString(),
            icon: ShieldAlert,
            color: summary.atRiskCount > 0 ? "text-red-500" : "text-[var(--color-muted-foreground)]",
            bg:    summary.atRiskCount > 0 ? "bg-red-50 dark:bg-red-950/50" : "bg-[var(--color-muted)]",
            danger: summary.atRiskCount > 0,
          },
        ].map(({ label, value, icon: Icon, color, bg, danger }) => (
          <div key={label} className={cn("rounded-xl border border-[var(--color-border)] p-4 flex items-start gap-3", bg)}>
            <span className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/60 dark:bg-black/20", color)}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium">{label}</p>
              <p className={cn("text-lg font-bold mt-0.5", danger ? "text-red-500" : "text-[var(--color-foreground)]")}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Revenue & customer trend ── */}
      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--color-primary)]" />
              Monthly Revenue & Active Customers — Last 12 Months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gRevLtv"  x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gProfLtv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={(props) => <ChartTip {...props} currency={currency} isMonth />} />
                <Legend formatter={(v) => <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>{v}</span>} />
                <Area type="monotone" name="Revenue"    dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#gRevLtv)"  dot={false} />
                <Area type="monotone" name="Net Profit" dataKey="profit"  stroke="#22c55e" strokeWidth={2} fill="url(#gProfLtv)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
        {(["cohorts", "customers", "frequency"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            )}
          >
            {tab === "cohorts" ? "Cohort Analysis"
              : tab === "customers" ? "Top Customers"
              : "Purchase Frequency"}
          </button>
        ))}
      </div>

      {/* ── Cohorts tab ── */}
      {activeTab === "cohorts" && (
        <div className="space-y-6">
          {/* Two charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Avg Profit LTV by Cohort</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={cohorts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="cohort" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={40} />
                    <Tooltip content={(props) => <ChartTip {...props} currency={currency} isMonth />} />
                    <Bar dataKey="avgLtv" name="Avg Profit LTV" radius={[3, 3, 0, 0]} maxBarSize={28}>
                      {cohorts.map((c, i) => (
                        <Cell key={i} fill={`hsl(${142 - (c.avgLtv / maxLtv) * 60}, 65%, 50%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Repeat Purchase Rate by Cohort</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={cohorts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="cohort" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} tickLine={false} axisLine={false} width={36} />
                    <Tooltip content={(props) => <ChartTip {...props} currency={currency} isMonth />} />
                    <Line type="monotone" name="Repeat Rate" dataKey="repeatRate" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Cohort table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cohort Performance Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <tr>
                      {[
                        "Cohort", "Customers", "Total Revenue", "Total Profit",
                        "Avg LTV", "Avg Rev / Customer", "Avg Orders", "Repeat Rate",
                      ].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {cohorts.map((c) => (
                      <tr key={c.cohort} className="hover:bg-[var(--color-muted)]/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-[var(--color-foreground)] whitespace-nowrap">
                          {fmtMonth(c.cohort)}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{c.customers}</td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(c.revenue, currency)}</td>
                        <td className={cn("px-4 py-3 font-semibold tabular-nums", c.profit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                          {formatCurrency(c.profit, currency)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden flex-shrink-0">
                              <div className="h-full bg-[var(--color-primary)] rounded-full transition-all"
                                style={{ width: `${Math.min(100, (c.avgLtv / maxLtv) * 100)}%` }} />
                            </div>
                            <span className="tabular-nums whitespace-nowrap">{formatCurrency(c.avgLtv, currency)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(c.avgRevPerCustomer, currency)}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--color-muted-foreground)]">{c.avgOrdersPerCustomer.toFixed(1)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("font-semibold",
                            c.repeatRate >= 30 ? "text-green-600 dark:text-green-400"
                            : c.repeatRate >= 10 ? "text-yellow-600 dark:text-yellow-400"
                            : "text-[var(--color-muted-foreground)]")}>
                            {formatPercent(c.repeatRate, 1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Top customers tab ── */}
      {activeTab === "customers" && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--color-muted-foreground)] font-medium">Filter:</span>
            {(["all", "medium", "high"] as const).map((r) => (
              <button key={r} onClick={() => setRisk(r)}
                className={cn("text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors",
                  riskFilter === r
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40")}>
                {r === "all" ? "All customers" : r === "medium" ? "⚠ At risk" : "🔴 Churning"}
              </button>
            ))}
            <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">
              {sortedCustomers.length} customers
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">#</th>
                      <ThCol label="Customer"           k="email" />
                      <ThCol label="Orders"             k="orderCount" />
                      <ThCol label="Revenue LTV"        k="totalRevenue" />
                      <ThCol label="Profit LTV"         k="totalProfit" />
                      <ThCol label="Est. Annual LTV"    k="estimatedAnnualLtv" />
                      <ThCol label="Avg Order"          k="avgOrderValue" />
                      <ThCol label="First Order"        k="firstOrderDate" />
                      <ThCol label="Days Since Last"    k="daysSinceLast" />
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {sortedCustomers.map((c, i) => (
                      <tr key={c.email} className="hover:bg-[var(--color-muted)]/50 transition-colors group">
                        <td className="px-4 py-3">
                          {i < 3 ? (
                            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                              i === 0 ? "bg-amber-400 text-white"
                              : i === 1 ? "bg-zinc-400 text-white"
                              : "bg-orange-400 text-white")}>
                              {i + 1}
                            </span>
                          ) : (
                            <span className="text-[var(--color-muted-foreground)] pl-1">{i + 1}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold">
                              {c.email[0].toUpperCase()}
                            </span>
                            <span className="text-[var(--color-foreground)] truncate max-w-[160px] font-medium">{c.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--color-muted-foreground)] tabular-nums">{c.orderCount}</td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(c.totalRevenue, currency)}</td>
                        <td className={cn("px-4 py-3 font-bold tabular-nums", c.totalProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                          {formatCurrency(c.totalProfit, currency)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[var(--color-muted-foreground)]">
                          {c.estimatedAnnualLtv > 0 ? formatCurrency(c.estimatedAnnualLtv, currency) : "—"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(c.avgOrderValue, currency)}</td>
                        <td className="px-4 py-3 text-[var(--color-muted-foreground)] whitespace-nowrap">{fmtDate(c.firstOrderDate)}</td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className={cn("font-medium",
                            c.daysSinceLast > 90 ? "text-red-500"
                            : c.daysSinceLast > 60 ? "text-yellow-600 dark:text-yellow-400"
                            : "text-[var(--color-muted-foreground)]")}>
                            {c.daysSinceLast}d
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={CHURN_STYLE[c.churnRisk].badge as "success" | "warning" | "destructive" | "outline"} className="text-[10px]">
                            {CHURN_STYLE[c.churnRisk].label}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {sortedCustomers.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-[var(--color-muted-foreground)]">
                          No customers match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Churn risk callout */}
          {summary.atRiskCount > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/40 px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-800 dark:text-yellow-300">
                <strong>{summary.atRiskCount} customer{summary.atRiskCount !== 1 ? "s" : ""}</strong> haven't purchased in 60+ days.
                Consider a win-back campaign to recover their lifetime value.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Frequency tab ── */}
      {activeTab === "frequency" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Order Frequency Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={frequency} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip
                    formatter={(v: unknown) => [Number(v).toLocaleString(), "Customers"]}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="customers" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {frequency.map((_, i) => (
                      <Cell key={i} fill={FREQ_COLORS[i % FREQ_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Frequency Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {frequency.map((b, i) => (
                <div key={b.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-[var(--color-foreground)] font-medium">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: FREQ_COLORS[i % FREQ_COLORS.length] }} />
                      {b.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--color-muted-foreground)] tabular-nums">{b.customers.toLocaleString()} customers</span>
                      <span className="font-semibold text-[var(--color-foreground)] w-12 text-right tabular-nums">{b.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${b.pct}%`, background: FREQ_COLORS[i % FREQ_COLORS.length] }} />
                  </div>
                </div>
              ))}

              {/* Single-order insight */}
              {frequency[0] && (
                <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-3 text-xs text-[var(--color-muted-foreground)]">
                  <strong className="text-[var(--color-foreground)]">
                    {frequency[0].pct.toFixed(0)}%
                  </strong>{" "}
                  of customers placed only one order. Increasing this cohort's repeat rate by even 5% would significantly lift overall LTV.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
