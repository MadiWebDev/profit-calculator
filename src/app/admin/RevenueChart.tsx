"use client";

import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { MrrMonth } from "@/lib/admin-stats";

function shortMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) +
    " '" + String(y).slice(2);
}

export default function RevenueChart({ data }: { data: MrrMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((v: number, name: string) => [formatCurrency(v, "USD"), name]) as any}
          labelFormatter={(label) => shortMonth(String(label ?? ""))}
          contentStyle={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend
          formatter={(v: string) => (
            <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>{v}</span>
          )}
        />
        <Bar dataKey="newMrr" name="New MRR" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="churnedMrr" name="Churned MRR" fill="#ef4444" radius={[3, 3, 0, 0]} />
        <Area
          type="monotone"
          dataKey="mrr"
          name="MRR"
          stroke="#22c55e"
          fill="#22c55e"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
