"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, ShoppingCart, Percent,
  Package, Lock, Eye, Download, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { PeriodSummary } from "@/lib/profit-engine";

interface ViewerData {
  current: PeriodSummary;
  changes: { revenue: number; profit: number; margin: number; orders: number };
  chartData: { date: string; revenue: number; profit: number; orders: number }[];
  topProducts: {
    id: string; name: string; sku?: string;
    totalRevenue: number; totalProfit: number;
    totalOrders: number; avgProfitMargin: number; imageUrl?: string;
  }[];
  recentOrders: {
    id: string; orderNumber: string; orderDate: string;
    status: string; grossRevenue: number; netProfit: number;
    profitMargin: number; customerEmail?: string;
  }[];
  adSpendByPlatform: {
    platform: string; spend: number; revenue: number; conversions: number; roas: number;
  }[];
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_BADGE: Record<string, "success" | "outline" | "warning" | "destructive"> = {
  fulfilled: "success",
  pending:   "outline",
  refunded:  "warning",
  cancelled: "destructive",
};

const PLATFORM_COLORS: Record<string, string> = {
  meta:      "#3b82f6",
  google:    "#ef4444",
  tiktok:    "#000000",
  pinterest: "#e60023",
  snapchat:  "#facc15",
};

function exportRecentOrdersCSV(orders: ViewerData["recentOrders"]) {
  const headers = ["Order #", "Date", "Status", "Revenue", "Net Profit", "Margin %"];
  const rows = orders.map((o) => [
    o.orderNumber,
    new Date(o.orderDate).toLocaleDateString(),
    o.status,
    o.grossRevenue.toFixed(2),
    o.netProfit.toFixed(2),
    o.profitMargin.toFixed(2),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "recent-orders.csv"; a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  data: ViewerData;
  userName: string;
}

export function ViewerDashboardClient({ data, userName }: Props) {
  const { current, changes, chartData, topProducts, recentOrders, adSpendByPlatform } = data;

  const totalAdSpend = adSpendByPlatform.reduce((s, p) => s + p.spend, 0);

  return (
    <div className="space-y-6">
      {/* Header with read-only context */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            Welcome back, {userName.split(" ")[0]}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            Month-to-date performance snapshot
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
            <Eye className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            <span>Read-only access</span>
          </div>
        </div>
      </div>

      {/* Access context banner */}
      <div className="flex items-center gap-3 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-3">
        <Lock className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-foreground)]">
            You have <strong>Viewer</strong> access — you can view all dashboards and export reports, but cannot edit data.
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
            Contact your workspace owner or admin to request elevated permissions.
          </p>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Net Profit (MTD)"
          value={formatCurrency(current.netProfit)}
          change={changes.profit}
          changeLabel="vs last month"
          icon={DollarSign}
          highlight
        />
        <StatCard
          label="Revenue (MTD)"
          value={formatCurrency(current.totalRevenue)}
          change={changes.revenue}
          changeLabel="vs last month"
          icon={TrendingUp}
        />
        <StatCard
          label="Net Margin"
          value={formatPercent(current.netMargin)}
          change={changes.margin}
          changeLabel="pp vs last month"
          icon={Percent}
        />
        <StatCard
          label="Orders (MTD)"
          value={current.orderCount.toLocaleString()}
          change={changes.orders}
          changeLabel="vs last month"
          icon={ShoppingCart}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Gross Margin",     value: formatPercent(current.grossMargin),          danger: false },
          { label: "Avg Order Value",  value: formatCurrency(current.avgOrderValue),       danger: false },
          { label: "Total COGS",       value: formatCurrency(current.totalCogs),           danger: false },
          { label: "Total Refunds",    value: formatCurrency(current.totalRefunds),        danger: current.totalRefunds > 0 },
        ].map(({ label, value, danger }) => (
          <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-muted-foreground)] mb-1">{label}</p>
            <p className={cn("text-xl font-bold", danger ? "text-red-500" : "text-[var(--color-foreground)]")}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Revenue & Profit chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Revenue & Profit — Last 30 Days</CardTitle>
            <Link href="/dashboard/pnl" className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1">
              Full P&L <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="vProfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false} axisLine={false} interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tickLine={false} axisLine={false}
              />
              <Tooltip
                formatter={(v: unknown, name: unknown) => [formatCurrency(v as number), name === "revenue" ? "Revenue" : "Net Profit"]}
                labelFormatter={(l: unknown) => new Date(l as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
              />
              <Legend formatter={(v) => <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>{v === "revenue" ? "Revenue" : "Net Profit"}</span>} />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#vRevGrad)" dot={false} />
              <Area type="monotone" dataKey="profit"  stroke="#22c55e" strokeWidth={2} fill="url(#vProfGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Products + Ad Spend side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-[var(--color-primary)]" />
                Top Products by Profit
              </CardTitle>
              <Link href="/dashboard/products" className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1">
                All products <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {topProducts.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">No product data yet.</div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {topProducts.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Rank */}
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0",
                      idx === 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                        : idx === 1 ? "bg-slate-100 text-slate-600 dark:bg-slate-800"
                        : idx === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                        : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                    )}>
                      {idx + 1}
                    </span>
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{p.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {p.totalOrders} orders · {formatCurrency(p.totalRevenue)} revenue
                      </p>
                    </div>
                    {/* Profit + margin */}
                    <div className="text-right flex-shrink-0">
                      <p className={cn("text-sm font-semibold", p.totalProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                        {formatCurrency(p.totalProfit)}
                      </p>
                      <p className={cn(
                        "text-xs",
                        p.avgProfitMargin >= 30 ? "text-green-600 dark:text-green-400"
                          : p.avgProfitMargin >= 15 ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-500"
                      )}>
                        {formatPercent(p.avgProfitMargin)} margin
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ad spend by platform */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Ad Spend — Last 30 Days</CardTitle>
              <Link href="/dashboard/ad-spend" className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1">
                Full breakdown <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {adSpendByPlatform.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">No ad spend data for this period.</div>
            ) : (
              <div className="space-y-4">
                {/* Bar chart */}
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={adSpendByPlatform} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="platform" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${v}`} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v: unknown) => [formatCurrency(v as number)]}
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="spend" name="Spend" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Platform rows */}
                <div className="space-y-2">
                  {adSpendByPlatform.map((p) => (
                    <div key={p.platform} className="flex items-center gap-3">
                      <div
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ background: PLATFORM_COLORS[p.platform] ?? "var(--color-primary)" }}
                      />
                      <span className="text-sm capitalize text-[var(--color-foreground)] flex-1">{p.platform}</span>
                      <span className="text-xs text-[var(--color-muted-foreground)]">{formatCurrency(p.spend)} spend</span>
                      <span className={cn(
                        "text-xs font-semibold",
                        p.roas >= 3 ? "text-green-600 dark:text-green-400"
                          : p.roas >= 1.5 ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-500"
                      )}>
                        {p.roas.toFixed(2)}x ROAS
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)] text-xs font-medium text-[var(--color-foreground)]">
                    <span>Total</span>
                    <span>{formatCurrency(totalAdSpend)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Orders</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => exportRecentOrdersCSV(recentOrders)}
              >
                <Download className="h-3 w-3" /> Export
              </Button>
              <Link href="/dashboard/orders" className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1">
                All orders <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">No orders yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    {["Order", "Date", "Status", "Revenue", "Net Profit", "Margin"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--color-foreground)] whitespace-nowrap">
                        #{o.orderNumber}
                        {o.customerEmail && (
                          <p className="text-xs text-[var(--color-muted-foreground)] font-normal">{o.customerEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)] whitespace-nowrap text-xs">
                        {new Date(o.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[o.status] ?? "outline"} className="capitalize text-xs">
                          {o.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-foreground)]">{formatCurrency(o.grossRevenue)}</td>
                      <td className={cn("px-4 py-3 font-semibold", o.netProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                        {formatCurrency(o.netProfit)}
                      </td>
                      <td className={cn(
                        "px-4 py-3 font-medium",
                        o.profitMargin >= 20 ? "text-green-600 dark:text-green-400"
                          : o.profitMargin >= 10 ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-500"
                      )}>
                        {formatPercent(o.profitMargin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Explore more — viewer nav shortcuts */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-3">
          Explore
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Full P&L",        href: "/dashboard/pnl",       desc: "Income statement" },
            { label: "All Orders",      href: "/dashboard/orders",    desc: "Search & filter" },
            { label: "Products",        href: "/dashboard/products",  desc: "Margin by product" },
            { label: "LTV & Cohorts",   href: "/dashboard/ltv",       desc: "Customer analysis" },
            { label: "Reports",         href: "/dashboard/reports",   desc: "Export to CSV/PDF" },
          ].map(({ label, href, desc }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 hover:border-[var(--color-primary)]/40 hover:shadow-sm transition-all"
            >
              <span className="text-sm font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors flex items-center gap-1">
                {label}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">{desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
