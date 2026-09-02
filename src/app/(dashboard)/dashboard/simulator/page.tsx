"use client";

import { useState, useMemo } from "react";
import { Sliders, TrendingUp, TrendingDown } from "lucide-react";
import { calcSimulator } from "@/lib/profit-engine";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface SliderField {
  key: keyof typeof DEFAULTS;
  label: string;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
}

const DEFAULTS = {
  sellingPrice: 49.99,
  cogs: 12,
  shippingCost: 4.5,
  transactionFeePercent: 2.9,
  transactionFeeFixed: 0.3,
  platformFeePercent: 2,
  adSpendPerUnit: 8,
  quantity: 100,
  refundRatePercent: 3,
};

const FIELDS: SliderField[] = [
  { key: "sellingPrice",          label: "Selling Price",       min: 1,   max: 500,  step: 0.5 },
  { key: "cogs",                  label: "Product Cost (COGS)", min: 0,   max: 200,  step: 0.5 },
  { key: "shippingCost",          label: "Shipping Cost",       min: 0,   max: 50,   step: 0.5 },
  { key: "transactionFeePercent", label: "Transaction Fee %",   min: 0,   max: 10,   step: 0.1,  suffix: "%" },
  { key: "platformFeePercent",    label: "Platform Fee %",      min: 0,   max: 10,   step: 0.1,  suffix: "%" },
  { key: "adSpendPerUnit",        label: "Ad Spend / Unit",     min: 0,   max: 100,  step: 0.5 },
  { key: "quantity",              label: "Units to Sell",       min: 1,   max: 10000,step: 1 },
  { key: "refundRatePercent",     label: "Refund Rate %",       min: 0,   max: 30,   step: 0.5,  suffix: "%" },
];

export default function SimulatorPage() {
  const [values, setValues] = useState(DEFAULTS);

  const result = useMemo(() => calcSimulator({
    ...values,
    transactionFeeFixed: DEFAULTS.transactionFeeFixed,
  }), [values]);

  const set = (key: keyof typeof DEFAULTS, val: number) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const costBreakdown = [
    { name: "COGS",      value: values.cogs,            color: "#ef4444" },
    { name: "Shipping",  value: values.shippingCost,    color: "#f97316" },
    { name: "Fees",      value: result.totalFees / (values.quantity || 1), color: "#eab308" },
    { name: "Ad Spend",  value: values.adSpendPerUnit,  color: "#8b5cf6" },
    { name: "Net Profit",value: Math.max(0, result.profitPerUnit), color: "#22c55e" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Sliders className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">What-If Simulator</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Drag sliders to model pricing, COGS, and ad spend changes before you make them.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Controls */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Adjust Variables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{field.label}</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--color-muted-foreground)]">{field.prefix}</span>
                    <Input
                      type="number"
                      className="h-7 w-20 text-xs text-right"
                      value={values[field.key]}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      onChange={(e) => set(field.key, parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-xs text-[var(--color-muted-foreground)]">{field.suffix}</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.key]}
                  onChange={(e) => set(field.key, parseFloat(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[var(--color-primary)] bg-[var(--color-border)]"
                  aria-label={field.label}
                />
                <div className="flex justify-between text-[10px] text-[var(--color-muted-foreground)]">
                  <span>{field.prefix}{field.min}{field.suffix}</span>
                  <span>{field.prefix}{field.max}{field.suffix}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {/* Headline metrics */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Profit / Unit"
              value={formatCurrency(result.profitPerUnit)}
              highlight={result.profitPerUnit > 0}
              icon={result.profitPerUnit >= 0 ? TrendingUp : TrendingDown}
            />
            <StatCard
              label="Profit Margin"
              value={formatPercent(result.profitMargin)}
              highlight={result.profitMargin >= 20}
            />
            <StatCard label="Total Net Profit" value={formatCurrency(result.totalProfit)} />
            <StatCard label="ROI %" value={formatPercent(result.roi)} />
          </div>

          {/* More metrics */}
          <Card>
            <CardContent className="pt-5">
              <div className="space-y-1">
                {[
                  { label: "Total Revenue", value: formatCurrency(result.totalRevenue) },
                  { label: "Break-Even Price", value: formatCurrency(result.breakEvenPrice) },
                  { label: "Break-Even Units", value: result.breakEvenUnits.toLocaleString() },
                  { label: "Cost Per Unit", value: formatCurrency(result.effectiveCostPerUnit) },
                  { label: "Total Fees", value: formatCurrency(result.totalFees) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2 px-2 rounded hover:bg-[var(--color-muted)] text-sm">
                    <span className="text-[var(--color-muted-foreground)]">{label}</span>
                    <span className="font-semibold text-[var(--color-foreground)]">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cost breakdown chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Per-Unit Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costBreakdown} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => `${v.toFixed(0)}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={60} />
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <Tooltip formatter={((v: number) => [`${v.toFixed(2)}`, ""]) as any} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {costBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
