"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { Users, TrendingUp, RefreshCw, Award } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

interface CohortRow {
  cohort: string; customers: number; revenue: number; profit: number;
  repeatCustomers: number; avgLtv: number; repeatRate: number; avgRevPerCustomer: number;
}

interface CustomerRow {
  email: string; orderCount: number; totalRevenue: number; totalProfit: number;
  avgOrderValue: number; firstOrderDate: string; lastOrderDate: string; daysSinceFirst: number;
}

interface LtvData {
  cohorts: CohortRow[];
  topCustomers: CustomerRow[];
  summary: { totalCustomers: number; repeatCustomers: number; repeatRate: number; avgLtv: number; avgOrdersPerCust: number };
}

function formatMonth(m: unknown): string {
  return new Date(String(m) + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function LtvClient({ data }: { data: LtvData }) {
  const { cohorts, topCustomers, summary } = data;
  const { currency } = useCurrency();
  const hasCohorts = cohorts.length > 0;

  const maxLtv = Math.max(...cohorts.map((c) => c.avgLtv), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Customer LTV & Cohort Analysis</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Understand which customers drive long-term profitability.</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers"        value={summary.totalCustomers.toLocaleString()} icon={Users} />
        <StatCard label="Avg Customer LTV"       value={formatCurrency(summary.avgLtv, currency)}          icon={TrendingUp} highlight />
        <StatCard label="Repeat Purchase Rate"   value={formatPercent(summary.repeatRate)}        icon={RefreshCw} />
        <StatCard label="Avg Orders / Customer"  value={summary.avgOrdersPerCust.toFixed(2)}      icon={Award} />
      </div>

      {!hasCohorts ? (
        <div className="text-center py-20 text-[var(--color-muted-foreground)]">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">No customer data yet</p>
          <p className="text-sm mt-1">Import orders with customer emails to unlock cohort analysis.</p>
        </div>
      ) : (
        <>
          {/* Cohort chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Avg Profit LTV by Cohort Month</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={cohorts} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="cohort" tickFormatter={formatMonth} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${v.toFixed(0)}`} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((v: number) => [formatCurrency(v, currency), "Avg LTV"]) as any}
                      labelFormatter={formatMonth}
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="avgLtv" name="Avg Profit LTV" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Repeat Purchase Rate by Cohort</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={cohorts} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="cohort" tickFormatter={formatMonth} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((v: number) => [`${v.toFixed(1)}%`, "Repeat Rate"]) as any}
                      labelFormatter={formatMonth}
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="repeatRate" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Cohort table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cohort Performance Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <tr>
                      {["Cohort", "Customers", "Total Revenue", "Total Profit", "Avg LTV", "Avg Rev/Customer", "Repeat Rate"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {cohorts.map((c) => (
                      <tr key={c.cohort} className="hover:bg-[var(--color-muted)]/40">
                        <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">{formatMonth(c.cohort)}</td>
                        <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{c.customers}</td>
                        <td className="px-4 py-3">{formatCurrency(c.revenue, currency)}</td>
                        <td className={cn("px-4 py-3 font-semibold", c.profit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                          {formatCurrency(c.profit, currency)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-[var(--color-muted)] rounded-full overflow-hidden">
                              <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${(c.avgLtv / maxLtv) * 100}%` }} />
                            </div>
                            <span>{formatCurrency(c.avgLtv, currency)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{formatCurrency(c.avgRevPerCustomer, currency)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("font-medium", c.repeatRate >= 30 ? "text-green-600 dark:text-green-400" : c.repeatRate >= 10 ? "text-yellow-600" : "text-[var(--color-muted-foreground)]")}>
                            {formatPercent(c.repeatRate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Top customers */}
          {topCustomers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 20 Customers by Profit LTV</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                      <tr>
                        {["Customer", "Orders", "Revenue", "Profit LTV", "Avg Order Value", "First Order", "Active (days)"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {topCustomers.map((c, i) => (
                        <tr key={c.email} className="hover:bg-[var(--color-muted)]/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                              <span className="text-[var(--color-foreground)] truncate max-w-[180px]">{c.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{c.orderCount}</td>
                          <td className="px-4 py-3">{formatCurrency(c.totalRevenue, currency)}</td>
                          <td className={cn("px-4 py-3 font-bold", c.totalProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                            {formatCurrency(c.totalProfit, currency)}
                          </td>
                          <td className="px-4 py-3">{formatCurrency(c.avgOrderValue, currency)}</td>
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                            {new Date(c.firstOrderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{c.daysSinceFirst}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
