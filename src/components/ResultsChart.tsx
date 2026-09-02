"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#22c55e", "#8b5cf6", "#ec4899"];

interface ChartEntry {
  name: string;
  value: number;
  color: string;
}

interface ResultsChartProps {
  data: ChartEntry[];
  type?: "pie" | "bar";
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: ChartEntry }[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-[var(--color-foreground)]">{entry.name}</p>
      <p className="text-[var(--color-primary)] font-semibold">
        {formatCurrency(entry.value)}
      </p>
    </div>
  );
}

function CustomLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
}) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function ResultsChart({ data, type = "pie" }: ResultsChartProps) {
  const positiveData = useMemo(
    () =>
      data
        .filter((d) => d.value > 0)
        .map((d, i) => ({ ...d, color: COLORS[i % COLORS.length] })),
    [data]
  );

  if (!positiveData.length) return null;

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={positiveData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickFormatter={(v) => formatCurrency(v, "USD", true)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {positiveData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={positiveData}
          cx="50%"
          cy="50%"
          outerRadius={110}
          dataKey="value"
          labelLine={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label={CustomLabel as any}
        >
          {positiveData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 12, color: "var(--color-foreground)" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
