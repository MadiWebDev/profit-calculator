"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Sliders, TrendingUp, TrendingDown, DollarSign, Percent,
  RotateCcw, Download, ChevronDown, ChevronUp, Info,
  Package, Truck, CreditCard, Megaphone, ShoppingCart,
  BarChart3, Target, AlertTriangle, CheckCircle2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area, ReferenceLine,
  PieChart, Pie, Legend,
} from "recharts";
import { calcSimulator } from "@/lib/profit-engine";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

// ─── Types & Constants ────────────────────────────────────────────────────────

const DEFAULTS = {
  sellingPrice:          49.99,
  cogs:                  12.00,
  shippingCost:           4.50,
  transactionFeePercent:  2.90,
  transactionFeeFixed:    0.30,
  platformFeePercent:     2.00,
  adSpendPerUnit:         8.00,
  quantity:             100,
  refundRatePercent:      3.00,
};

type Vals = typeof DEFAULTS;
type ValKey = keyof Vals;

interface FieldDef {
  key: ValKey;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  icon: React.ElementType;
  group: "pricing" | "costs" | "marketing";
  tooltip: string;
}

const FIELDS: FieldDef[] = [
  { key: "sellingPrice",          label: "Selling Price",        min: 1,   max: 1000, step: 0.5,  icon: DollarSign,   group: "pricing",   tooltip: "The price your customer pays." },
  { key: "refundRatePercent",     label: "Refund Rate",          min: 0,   max: 50,   step: 0.5,  suffix: "%", icon: RotateCcw,    group: "pricing",   tooltip: "Expected % of orders that get refunded." },
  { key: "cogs",                  label: "Product Cost (COGS)",  min: 0,   max: 500,  step: 0.5,  icon: Package,      group: "costs",     tooltip: "Cost to manufacture or source one unit." },
  { key: "shippingCost",          label: "Shipping Cost",        min: 0,   max: 100,  step: 0.5,  icon: Truck,        group: "costs",     tooltip: "Your cost to ship one unit to the customer." },
  { key: "transactionFeePercent", label: "Transaction Fee %",    min: 0,   max: 10,   step: 0.1,  suffix: "%", icon: CreditCard,   group: "costs",     tooltip: "Payment processor % fee (e.g. Stripe 2.9%)." },
  { key: "platformFeePercent",    label: "Platform Fee %",       min: 0,   max: 10,   step: 0.1,  suffix: "%", icon: ShoppingCart, group: "costs",     tooltip: "Marketplace platform % fee (e.g. Shopify 0.5%)." },
  { key: "adSpendPerUnit",        label: "Ad Spend / Unit",      min: 0,   max: 200,  step: 0.5,  icon: Megaphone,    group: "marketing", tooltip: "Allocated ad cost per unit sold." },
  { key: "quantity",              label: "Units to Sell",        min: 1,   max: 50000,step: 1,    icon: BarChart3,    group: "marketing", tooltip: "Projected number of units for this run." },
];

const GROUP_LABELS = { pricing: "Pricing", costs: "Costs & Fees", marketing: "Marketing & Volume" };

const COST_COLORS: Record<string, string> = {
  COGS:      "#3b82f6",
  Shipping:  "#f59e0b",
  Fees:      "#ec4899",
  "Ad Spend":"#8b5cf6",
  Profit:    "#22c55e",
  Loss:      "#ef4444",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pctOf(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function healthColor(margin: number) {
  if (margin >= 30) return "text-green-600 dark:text-green-400";
  if (margin >= 15) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500";
}

function healthLabel(margin: number): { label: string; variant: "success" | "warning" | "destructive" } {
  if (margin >= 30) return { label: "Healthy",  variant: "success" };
  if (margin >= 15) return { label: "Marginal", variant: "warning" };
  return { label: "Unprofitable", variant: "destructive" };
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-3 text-xs min-w-[150px] space-y-1">
      {label !== undefined && (
        <p className="font-semibold text-[var(--color-foreground)] border-b border-[var(--color-border)] pb-1 mb-1">{label}</p>
      )}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums text-[var(--color-foreground)]">
            {formatCurrency(p.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Slider Row ───────────────────────────────────────────────────────────────

function SliderRow({
  field, value, onChange, currency,
}: {
  field: FieldDef; value: number; onChange: (v: number) => void; currency: string;
}) {
  const Icon = field.icon;
  const isMonetary = !field.suffix;
  const displayVal = isMonetary
    ? formatCurrency(value, currency)
    : `${value}${field.suffix}`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] flex-shrink-0" />
          <Label className="text-xs font-medium truncate">{field.label}</Label>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Input
            type="number"
            className="h-7 w-[78px] text-xs text-right tabular-nums"
            value={value}
            step={field.step}
            min={field.min}
            max={field.max}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(Math.min(field.max, Math.max(field.min, v)));
            }}
          />
          {field.suffix && (
            <span className="text-xs text-[var(--color-muted-foreground)] w-4">{field.suffix}</span>
          )}
        </div>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--color-primary)] bg-[var(--color-border)]"
        aria-label={field.label}
      />
      <div className="flex justify-between text-[10px] text-[var(--color-muted-foreground)]">
        <span>{field.min}{field.suffix ?? ""}</span>
        <span className="font-medium text-[var(--color-foreground)]">{displayVal}</span>
        <span>{field.max >= 1000 ? `${(field.max/1000).toFixed(0)}k` : field.max}{field.suffix ?? ""}</span>
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportScenario(values: Vals, result: ReturnType<typeof calcSimulator>, currency: string) {
  const rows = [
    ["Variable", "Value"],
    ["Selling Price",            values.sellingPrice],
    ["COGS",                     values.cogs],
    ["Shipping Cost",            values.shippingCost],
    ["Transaction Fee %",        values.transactionFeePercent],
    ["Transaction Fee Fixed",    values.transactionFeeFixed],
    ["Platform Fee %",           values.platformFeePercent],
    ["Ad Spend / Unit",          values.adSpendPerUnit],
    ["Units",                    values.quantity],
    ["Refund Rate %",            values.refundRatePercent],
    [],
    ["Result", "Value"],
    ["Profit / Unit",            result.profitPerUnit.toFixed(2)],
    ["Profit Margin %",          result.profitMargin.toFixed(2)],
    ["ROI %",                    result.roi.toFixed(2)],
    ["Total Revenue",            result.totalRevenue.toFixed(2)],
    ["Total Net Profit",         result.totalProfit.toFixed(2)],
    ["Break-Even Price",         result.breakEvenPrice.toFixed(2)],
    ["Break-Even Units",         result.breakEvenUnits],
    ["Effective Cost / Unit",    result.effectiveCostPerUnit.toFixed(2)],
    ["Total Fees",               result.totalFees.toFixed(2)],
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "simulator-scenario.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [values,   setValues]   = useState<Vals>(DEFAULTS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    pricing: true, costs: true, marketing: true,
  });
  const { currency } = useCurrency();

  const result = useMemo(() => calcSimulator(values), [values]);

  const set = useCallback((key: ValKey, val: number) =>
    setValues((prev) => ({ ...prev, [key]: val })), []);

  const reset = () => setValues(DEFAULTS);

  // Per-unit cost breakdown for pie / bar
  const feePerUnit = values.quantity > 0 ? result.totalFees / values.quantity : 0;
  const costSlices = [
    { name: "COGS",      value: values.cogs,               color: COST_COLORS.COGS },
    { name: "Shipping",  value: values.shippingCost,       color: COST_COLORS.Shipping },
    { name: "Fees",      value: feePerUnit,                color: COST_COLORS.Fees },
    { name: "Ad Spend",  value: values.adSpendPerUnit,     color: COST_COLORS["Ad Spend"] },
    result.profitPerUnit >= 0
      ? { name: "Profit",  value: result.profitPerUnit,    color: COST_COLORS.Profit }
      : { name: "Loss",    value: Math.abs(result.profitPerUnit), color: COST_COLORS.Loss },
  ].filter((d) => d.value > 0);

  // Revenue waterfall chart data (cumulative by unit qty)
  const waterfallSteps = [10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000].filter(
    (q) => q <= values.quantity * 1.2
  );
  if (!waterfallSteps.includes(values.quantity)) waterfallSteps.push(values.quantity);
  waterfallSteps.sort((a, b) => a - b);

  const scaleData = waterfallSteps.slice(-12).map((q) => {
    const r = calcSimulator({ ...values, quantity: q });
    return { qty: q, revenue: r.totalRevenue, profit: r.totalProfit };
  });

  // Sensitivity: price sensitivity (current ±30%)
  const sensitivityData = useMemo(() => {
    const range: number[] = [];
    for (let delta = -0.3; delta <= 0.31; delta += 0.05) {
      range.push(Math.round(delta * 100));
    }
    return range.map((deltaPct) => {
      const price = values.sellingPrice * (1 + deltaPct / 100);
      const r = calcSimulator({ ...values, sellingPrice: price });
      return {
        label: deltaPct === 0 ? "Base" : `${deltaPct > 0 ? "+" : ""}${deltaPct}%`,
        price: Math.round(price * 100) / 100,
        profit: r.profitPerUnit,
        margin: r.profitMargin,
      };
    });
  }, [values]);

  const health = healthLabel(result.profitMargin);
  const isLoss = result.profitPerUnit < 0;

  const byGroup = Object.entries(
    FIELDS.reduce<Record<string, FieldDef[]>>((acc, f) => {
      (acc[f.group] ??= []).push(f);
      return acc;
    }, {})
  ) as [keyof typeof GROUP_LABELS, FieldDef[]][];

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Sliders className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">What-If Simulator</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Model pricing, COGS, and ad spend changes before you commit to them.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportScenario(values, result, currency)}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* ── Profit health banner ── */}
      <div className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
        isLoss
          ? "border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800"
          : result.profitMargin < 15
          ? "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/40 dark:border-yellow-800"
          : "border-green-200 bg-green-50 dark:bg-green-950/40 dark:border-green-800"
      )}>
        <div className="flex items-center gap-2.5">
          {isLoss
            ? <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
            : result.profitMargin < 15
            ? <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            : <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
          }
          <span className="text-sm font-medium text-[var(--color-foreground)]">
            {isLoss
              ? `You're losing ${formatCurrency(Math.abs(result.profitPerUnit), currency)} per unit. Raise the price or cut costs.`
              : result.profitMargin < 15
              ? `Low margin (${formatPercent(result.profitMargin)}). Consider reducing COGS or ad spend.`
              : `Looking good — ${formatPercent(result.profitMargin)} net margin with ${formatCurrency(result.profitPerUnit, currency)} profit per unit.`
            }
          </span>
        </div>
        <Badge variant={health.variant} className="flex-shrink-0">{health.label}</Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* ── LEFT: Controls ── */}
        <div className="xl:col-span-2 space-y-3">
          {byGroup.map(([group, fields]) => (
            <Card key={group}>
              <button
                className="w-full flex items-center justify-between px-5 py-3 text-left"
                onClick={() => setExpanded((e) => ({ ...e, [group]: !e[group] }))}
              >
                <span className="text-sm font-semibold text-[var(--color-foreground)]">
                  {GROUP_LABELS[group]}
                </span>
                {expanded[group]
                  ? <ChevronUp className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                  : <ChevronDown className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                }
              </button>
              {expanded[group] && (
                <CardContent className="pt-0 pb-5 space-y-5">
                  {fields.map((field) => (
                    <SliderRow
                      key={field.key}
                      field={field}
                      value={values[field.key]}
                      onChange={(v) => set(field.key, v)}
                      currency={currency}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="xl:col-span-3 space-y-5">

          {/* Hero KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Profit / Unit"
              value={formatCurrency(result.profitPerUnit, currency)}
              highlight={result.profitPerUnit > 0}
              icon={result.profitPerUnit >= 0 ? TrendingUp : TrendingDown}
              className={isLoss ? "border-red-200 bg-red-50/50 dark:bg-red-950/30" : undefined}
            />
            <StatCard
              label="Net Margin"
              value={formatPercent(result.profitMargin)}
              highlight={result.profitMargin >= 20}
              icon={Percent}
            />
            <StatCard
              label="Total Profit"
              value={formatCurrency(result.totalProfit, currency)}
              icon={DollarSign}
            />
            <StatCard
              label="ROI"
              value={formatPercent(result.roi)}
              icon={Target}
            />
          </div>

          {/* Metrics grid */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Unit Economics</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-x-6 gap-y-0 divide-y divide-[var(--color-border)]">
                {[
                  { label: "Selling Price",       value: formatCurrency(values.sellingPrice, currency) },
                  { label: "Effective Cost / Unit",value: formatCurrency(result.effectiveCostPerUnit, currency) },
                  { label: "Total Revenue",        value: formatCurrency(result.totalRevenue, currency) },
                  { label: "Total Fees",           value: formatCurrency(result.totalFees, currency) },
                  { label: "Break-Even Price",     value: formatCurrency(result.breakEvenPrice, currency), highlight: values.sellingPrice < result.breakEvenPrice },
                  { label: "Break-Even Units",     value: result.breakEvenUnits.toLocaleString(), highlight: values.quantity < result.breakEvenUnits },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-[var(--color-muted-foreground)]">{label}</span>
                    <span className={cn("font-semibold tabular-nums", highlight ? "text-red-500" : "text-[var(--color-foreground)]")}>
                      {value}
                      {highlight && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-400" />}
                    </span>
                  </div>
                ))}
              </div>

              {/* Cost % breakdown bar */}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  Price composition (per unit = {formatCurrency(values.sellingPrice, currency)})
                </p>
                <div className="flex h-6 w-full rounded-lg overflow-hidden gap-px">
                  {costSlices.map((s) => (
                    <div
                      key={s.name}
                      title={`${s.name}: ${formatCurrency(s.value, currency)} (${pctOf(s.value, values.sellingPrice).toFixed(1)}%)`}
                      style={{ width: `${pctOf(s.value, values.sellingPrice)}%`, background: s.color }}
                      className="transition-all duration-300 min-w-[2px]"
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {costSlices.map((s) => (
                    <span key={s.name} className="flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
                      <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                      {s.name} {pctOf(s.value, values.sellingPrice).toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-unit cost pie */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Per-Unit Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={costSlices} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                      dataKey="value" paddingAngle={2} strokeWidth={0}>
                      {costSlices.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: unknown) => [formatCurrency(v as number, currency), ""]}
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {costSlices.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                        <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                        {s.name}
                      </span>
                      <span className="font-semibold tabular-nums text-[var(--color-foreground)]">
                        {formatCurrency(s.value, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scale chart — profit at different quantities */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[var(--color-primary)]" />
                Profit at Scale
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={scaleData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSimRev"  x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gSimProf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="qty" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={40} />
                  <Tooltip content={<ChartTip currency={currency} />} />
                  <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="4 2" />
                  <Area type="monotone" name="Revenue" dataKey="revenue" stroke="#3b82f6" strokeWidth={1.5} fill="url(#gSimRev)"  dot={false} />
                  <Area type="monotone" name="Profit"  dataKey="profit"  stroke="#22c55e" strokeWidth={2}   fill="url(#gSimProf)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Price sensitivity chart */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-[var(--color-primary)]" />
                Price Sensitivity (±30%)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={sensitivityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatCurrency(v, currency)} width={52} />
                  <ReferenceLine y={0} stroke="var(--color-border)" />
                  <Tooltip
                    formatter={(v: unknown, n: unknown) => [formatCurrency(v as number, currency), n as string]}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="profit" name="Profit / Unit" radius={[3, 3, 0, 0]} maxBarSize={24}>
                    {sensitivityData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.label === "Base" ? "#3b82f6" : d.profit >= 0 ? "#22c55e" : "#ef4444"}
                        fillOpacity={d.label === "Base" ? 1 : 0.75}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-[var(--color-muted-foreground)] mt-2 text-center">
                Profit / unit at each price point, holding all other variables constant.
              </p>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
