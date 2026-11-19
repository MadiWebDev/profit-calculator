/**
 * Analytics tab (Phase 3) — charts built only from real records, plus
 * CSV export. Any chart whose metric has no data shows "Tracking
 * unavailable" instead of an empty or fabricated chart.
 */
"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import type { CampaignCenterStats } from "@/lib/campaign-stats";
import { toCsv, downloadCsv } from "./csv";
import type { StatsState } from "./OverviewTab";

function BreakdownChart({
  title,
  rows,
  emptyNote,
}: {
  title: string;
  rows: { key: string; label: string; sent: number; delivered: number; deliveryRate: number | null }[];
  emptyNote?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {emptyNote ?? "No campaigns in this range."}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: number, name: string) => [value, name]) as any}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sent" name="Sent" fill="#22c55e" />
              <Bar dataKey="delivered" name="Delivered" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function Funnel({
  stats,
}: {
  stats: CampaignCenterStats;
}) {
  const k = stats.kpis;
  const stages = [
    { label: "Sent (provider accepted)", value: k.sent },
    { label: "Delivered", value: k.delivered },
    { label: "Opened", value: k.opened },
    { label: "Clicked", value: k.clicked },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Delivery funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!stats.hasTracking && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Tracking unavailable — no delivery events received in this
            range, so only the “Sent” stage is measured. Delivery, open,
            and click data arrive from the Resend / Meta webhooks.
          </p>
        )}
        {stages.map((s) => (
          <div key={s.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{s.label}</span>
              <span className="font-medium">{s.value}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-muted)]">
              <div
                className="h-2 rounded-full bg-emerald-500"
                style={{ width: `${(s.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Opens are estimated (Apple Mail Privacy Protection). WhatsApp
          read is tracked separately — see the Campaigns table.
        </p>
      </CardContent>
    </Card>
  );
}

export function AnalyticsTab({ stats }: { stats: StatsState }) {
  if (stats.loading && !stats.data) {
    return (
      <div className="space-y-4">
        <ListSkeleton rows={2} />
      </div>
    );
  }
  if (stats.error && !stats.data) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {stats.error}
      </p>
    );
  }
  const data = stats.data;
  if (!data) return null;

  const exportDaily = () => {
    downloadCsv(
      `campaign-daily-${data.range}.csv`,
      toCsv(
        ["Date", "Sent", "Delivered", "Failed", "Opened", "Clicked", "Read", "Bounced"],
        data.daily.map((d) => [d.date, d.sent, d.delivered, d.failed, d.opened, d.clicked, d.read, d.bounced])
      )
    );
  };

  const exportBreakdowns = () => {
    const rows: (string | number | null)[][] = [];
    for (const b of data.byChannel) rows.push(["Channel", b.label, b.campaigns, b.targeted, b.sent, b.delivered, b.deliveryRate === null ? null : `${(b.deliveryRate * 100).toFixed(1)}%`]);
    for (const b of data.byType) rows.push(["Template type", b.label, b.campaigns, b.targeted, b.sent, b.delivered, b.deliveryRate === null ? null : `${(b.deliveryRate * 100).toFixed(1)}%`]);
    for (const b of data.byPlan) rows.push(["Audience plan", b.label, b.campaigns, b.targeted, b.sent, b.delivered, b.deliveryRate === null ? null : `${(b.deliveryRate * 100).toFixed(1)}%`]);
    downloadCsv(
      `campaign-breakdowns-${data.range}.csv`,
      toCsv(["Group", "Name", "Campaigns", "Targeted", "Sent", "Delivered", "Delivery rate"], rows)
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportDaily} disabled={data.daily.length === 0}>
          <Download className="h-3.5 w-3.5" /> Export daily series (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportBreakdowns}>
          <Download className="h-3.5 w-3.5" /> Export breakdowns (CSV)
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Funnel stats={data} />
        <BreakdownChart title="Performance by channel" rows={data.byChannel} />
        <BreakdownChart title="Performance by template type" rows={data.byType} />
        <BreakdownChart title="Performance by audience plan" rows={data.byPlan} emptyNote="No plan-audience campaigns in this range — the mixed-audience bucket appears once any campaign is sent." />
      </div>
    </div>
  );
}
