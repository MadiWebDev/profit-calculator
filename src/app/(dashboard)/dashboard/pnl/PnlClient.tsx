"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Download, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

interface PnlSummary {
  grossRevenue: number; discounts: number; refunds: number; chargebacks: number;
  shippingRevenue: number; netRevenue: number; totalRevenue: number;
  cogs: number; grossProfit: number; grossMargin: number;
  transactionFees: number; shippingCosts: number; totalAdSpend: number; operatingExpenses: number;
  operatingProfit: number; operatingMargin: number;
  taxes: number; netProfit: number; netMargin: number; orderCount: number;
}

interface PnlData {
  summary: PnlSummary;
  adSpendByPlatform: { _id: string; spend: number }[];
  monthlyChart: { month: string; revenue: number; cogs: number; opex: number; netProfit: number }[];
}

// ── P&L Row component ─────────────────────────────────────────────────────────

type RowStyle = "header" | "sub" | "indent" | "subtotal" | "total" | "spacer";

function PnlRow({
  label, value, style = "sub", pct, currency = "USD", note,
}: {
  label: string; value?: number; style?: RowStyle;
  pct?: number; currency?: string; note?: string;
}) {
  if (style === "spacer") return <tr className="h-2"><td colSpan={3} /></tr>;

  const isNeg = (value ?? 0) < 0;

  const rowClass = cn(
    "text-sm",
    style === "header"   && "font-bold text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] bg-[var(--color-muted)]",
    style === "sub"      && "text-[var(--color-muted-foreground)]",
    style === "indent"   && "text-[var(--color-muted-foreground)] pl-6",
    style === "subtotal" && "font-semibold text-[var(--color-foreground)] border-t border-[var(--color-border)]",
    style === "total"    && "font-bold text-base text-[var(--color-foreground)] border-t-2 border-[var(--color-foreground)] bg-[var(--color-accent)]",
  );

  return (
    <tr className={rowClass}>
      <td className={cn("px-4 py-2", style === "indent" && "pl-10")}>
        {label}
        {note && <span className="ml-2 text-xs italic opacity-60">{note}</span>}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {value !== undefined ? (
          <span className={cn(
            style === "total" && (value >= 0 ? "text-[var(--color-primary)]" : "text-red-500"),
            isNeg && style !== "total" && "text-red-500",
          )}>
            {value < 0 ? `(${formatCurrency(Math.abs(value), currency)})` : formatCurrency(value, currency)}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-2 text-right text-xs text-[var(--color-muted-foreground)] tabular-nums w-20">
        {pct !== undefined ? formatPercent(pct) : ""}
      </td>
    </tr>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportPnlCSV(s: PnlSummary, from: string, to: string) {
  const rows = [
    ["CalcProfit — Profit & Loss Statement"],
    [`Period: ${from} to ${to}`],
    [],
    ["", "Amount (USD)", "% of Revenue"],
    ["REVENUE"],
    ["  Gross Revenue", s.grossRevenue.toFixed(2), ""],
    ["  Less: Discounts", `(${s.discounts.toFixed(2)})`, ""],
    ["  Less: Refunds", `(${s.refunds.toFixed(2)})`, ""],
    ["  Less: Chargebacks", `(${s.chargebacks.toFixed(2)})`, ""],
    ["  Shipping Revenue", s.shippingRevenue.toFixed(2), ""],
    ["NET REVENUE", s.totalRevenue.toFixed(2), "100.0%"],
    [],
    ["COST OF GOODS SOLD"],
    ["  Product Costs (COGS)", `(${s.cogs.toFixed(2)})`, s.totalRevenue > 0 ? `${((s.cogs / s.totalRevenue) * 100).toFixed(1)}%` : ""],
    ["GROSS PROFIT", s.grossProfit.toFixed(2), `${s.grossMargin.toFixed(1)}%`],
    [],
    ["OPERATING EXPENSES"],
    ["  Transaction Fees", `(${s.transactionFees.toFixed(2)})`, ""],
    ["  Shipping Costs", `(${s.shippingCosts.toFixed(2)})`, ""],
    ["  Advertising Spend", `(${s.totalAdSpend.toFixed(2)})`, ""],
    ["OPERATING PROFIT (EBIT)", s.operatingProfit.toFixed(2), `${s.operatingMargin.toFixed(1)}%`],
    [],
    ["  Taxes", `(${s.taxes.toFixed(2)})`, ""],
    ["NET PROFIT", s.netProfit.toFixed(2), `${s.netMargin.toFixed(1)}%`],
    [],
    ["ORDERS", s.orderCount.toString(), ""],
  ];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `pnl-${from}-${to}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

export function PnlClient({
  data, defaultFrom, defaultTo,
}: { data: PnlData; defaultFrom: string; defaultTo: string }) {
  const router = useRouter();
  const { currency } = useCurrency();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [isPending, startTransition] = useTransition();
  const { summary: s, adSpendByPlatform, monthlyChart } = data;

  const apply = () => startTransition(() => router.push(`/dashboard/pnl?from=${from}&to=${to}`));

  const formatMonth = (m: string) =>
    new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">P&L Statement</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">{from} — {to}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm" />
            </div>
            <Button size="sm" className="h-8" onClick={apply} disabled={isPending}>Apply</Button>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => exportPnlCSV(s, from, to)}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI headline row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Net Revenue",    value: s.totalRevenue,    pct: 100 },
          { label: "Gross Profit",   value: s.grossProfit,     pct: s.grossMargin },
          { label: "Operating Profit",value: s.operatingProfit,pct: s.operatingMargin },
          { label: "Net Profit",     value: s.netProfit,       pct: s.netMargin, highlight: true },
        ].map(({ label, value, pct, highlight }) => (
          <div key={label} className={cn(
            "rounded-xl border p-4",
            highlight
              ? "border-[var(--color-primary)]/30 bg-[var(--color-accent)]"
              : "border-[var(--color-border)] bg-[var(--color-card)]"
          )}>
            <p className="text-xs text-[var(--color-muted-foreground)] mb-1">{label}</p>
            <p className={cn("text-xl font-bold", value < 0 ? "text-red-500" : highlight ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]")}>
              {formatCurrency(value, currency)}
            </p>
            <div className="flex items-center gap-1 text-xs mt-0.5 text-[var(--color-muted-foreground)]">
              {pct > 0 ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
              {formatPercent(pct)} margin
            </div>
          </div>
        ))}
      </div>

      {/* P&L Table + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income Statement */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Income Statement</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
                    <th className="px-4 py-2 text-left font-medium">Item</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 text-right font-medium w-20">% Rev</th>
                  </tr>
                </thead>
                <tbody>
                  <PnlRow label="REVENUE" style="header" />
                  <PnlRow label="Gross Revenue"     style="indent" value={s.grossRevenue}     pct={s.totalRevenue > 0 ? (s.grossRevenue / s.totalRevenue) * 100 : 0} currency={currency} />
                  <PnlRow label="Less: Discounts"   style="indent" value={-s.discounts}       currency={currency} />
                  <PnlRow label="Less: Refunds"      style="indent" value={-s.refunds}         currency={currency} />
                  <PnlRow label="Less: Chargebacks"  style="indent" value={-s.chargebacks}     currency={currency} />
                  <PnlRow label="Shipping Revenue"   style="indent" value={s.shippingRevenue}  currency={currency} />
                  <PnlRow label="Net Revenue" style="subtotal" value={s.totalRevenue} pct={100} currency={currency} />
                  <PnlRow label="" style="spacer" />
                  <PnlRow label="COST OF GOODS SOLD" style="header" />
                  <PnlRow label="Product Costs (COGS)" style="indent" value={-s.cogs} pct={s.totalRevenue > 0 ? (s.cogs / s.totalRevenue) * 100 : 0} currency={currency} />
                  <PnlRow label="Gross Profit" style="subtotal" value={s.grossProfit} pct={s.grossMargin} currency={currency} />
                  <PnlRow label="" style="spacer" />
                  <PnlRow label="OPERATING EXPENSES" style="header" />
                  <PnlRow label="Transaction Fees"   style="indent" value={-s.transactionFees} currency={currency} />
                  <PnlRow label="Shipping Costs"     style="indent" value={-s.shippingCosts}   currency={currency} />
                  <PnlRow label="Advertising Spend"  style="indent" value={-s.totalAdSpend}    note={adSpendByPlatform.map((a) => `${a._id}: ${a.spend.toFixed(0)}`).join(", ")} currency={currency} />
                  <PnlRow label="Total Operating Expenses" style="subtotal" value={-s.operatingExpenses} currency={currency} />
                  <PnlRow label="Operating Profit (EBIT)" style="subtotal" value={s.operatingProfit} pct={s.operatingMargin} currency={currency} />
                  <PnlRow label="" style="spacer" />
                  <PnlRow label="TAX & OTHER" style="header" />
                  <PnlRow label="Taxes Collected" style="indent" value={-s.taxes} note="Pass-through" currency={currency} />
                  <PnlRow label="NET PROFIT" style="total" value={s.netProfit} pct={s.netMargin} currency={currency} />
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Ad spend breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ad Spend by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            {adSpendByPlatform.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)] text-center py-8">No ad spend data for this period.</p>
            ) : (
              <div className="space-y-3">
                {adSpendByPlatform
                  .sort((a, b) => b.spend - a.spend)
                  .map((p) => {
                    const pct = s.totalAdSpend > 0 ? (p.spend / s.totalAdSpend) * 100 : 0;
                    return (
                      <div key={p._id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize text-[var(--color-foreground)]">{p._id}</span>
                          <span className="font-medium">{formatCurrency(p.spend, currency)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--color-muted)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{pct.toFixed(1)}% of total ad spend</p>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly chart */}
      {monthlyChart.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: number, name: string) => [formatCurrency(v, currency), name]) as any}
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend formatter={(v) => <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>{v}</span>} />
                <Bar dataKey="revenue"   name="Revenue"    fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cogs"      name="COGS"       fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="opex"      name="Op. Expenses" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="netProfit" name="Net Profit" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
