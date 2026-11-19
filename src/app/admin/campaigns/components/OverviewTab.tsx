/**
 * Overview tab (Phase 3) — KPI cards computed from real records only,
 * plus the daily sends/delivered chart. A rate whose denominator is
 * zero renders as "Tracking unavailable", never as 0%.
 */
"use client";

import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  DATE_RANGE_LABELS,
  type CampaignCenterStats,
  type CampaignDateRangeKey,
} from "@/lib/campaign-stats";
import { cn } from "@/lib/utils";

export interface StatsState {
  loading: boolean;
  error: string | null;
  data: (CampaignCenterStats & { range: string; from: string | null; to: string | null }) | null;
}

function formatPct(rate: number | null): string {
  return rate === null ? "Tracking unavailable" : `${(rate * 100).toFixed(1)}%`;
}

function Kpi({
  label,
  value,
  sub,
  unavailable,
}: {
  label: string;
  value: string;
  sub?: string;
  unavailable?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold", unavailable && "text-base text-[var(--color-muted-foreground)]")}>
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function RangePicker({
  range,
  customFrom,
  customTo,
  onRangeChange,
  onCustomChange,
}: {
  range: CampaignDateRangeKey;
  customFrom: string;
  customTo: string;
  onRangeChange: (r: CampaignDateRangeKey) => void;
  onCustomChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-border)] p-1">
        {(Object.keys(DATE_RANGE_LABELS) as CampaignDateRangeKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onRangeChange(key)}
            aria-pressed={range === key}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              range === key
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            )}
          >
            {DATE_RANGE_LABELS[key]}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="range-from" className="text-[var(--color-muted-foreground)]">From</label>
          <input
            id="range-from"
            type="date"
            value={customFrom}
            onChange={(e) => onCustomChange(e.target.value, customTo)}
            className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
          />
          <label htmlFor="range-to" className="text-[var(--color-muted-foreground)]">To</label>
          <input
            id="range-to"
            type="date"
            value={customTo}
            onChange={(e) => onCustomChange(customFrom, e.target.value)}
            className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
          />
        </div>
      )}
    </div>
  );
}

export function OverviewTab({ stats }: { stats: StatsState }) {
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
  const k = data.kpis;

  return (
    <div className="space-y-4">
      {stats.loading && (
        <p className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <Spinner size="sm" label="" /> Refreshing…
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Campaigns" value={String(k.campaignsTotal)} sub={`${k.campaignsSent} sent · ${k.campaignsDraft} draft · ${k.campaignsFailed} failed`} />
        <Kpi label="Recipients targeted" value={String(k.targeted)} />
        <Kpi label="Sent (provider accepted)" value={String(k.sent)} sub={`${k.failed} failed · ${k.skipped} skipped`} />
        <Kpi label="Delivered" value={String(k.delivered)} sub={k.deliveryRate === null ? undefined : `Delivery rate ${formatPct(k.deliveryRate)}`} />
        <Kpi label="Delivery rate" value={formatPct(k.deliveryRate)} unavailable={k.deliveryRate === null} />
        <Kpi label="Open rate" value={formatPct(k.openRate)} unavailable={k.openRate === null} />
        <Kpi label="Click rate" value={formatPct(k.clickRate)} unavailable={k.clickRate === null} />
        <Kpi label="WhatsApp read rate" value={formatPct(k.readRate)} unavailable={k.readRate === null} />
        <Kpi label="Bounced" value={String(k.bounced)} sub={`${k.complained} complaints`} />
        <Kpi label="Unsubscribed" value={String(k.unsubscribed)} sub="On the suppression list" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sends and deliveries per day</CardTitle>
        </CardHeader>
        <CardContent>
          {data.daily.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Pick a bounded range (today, 7/30/90 days, this/last month, or
              custom) to see the daily trend — “All time” has no daily series.
            </p>
          ) : !data.hasTracking ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Tracking unavailable — no delivery events received in this
              range. The sends below are real; delivery data arrives from
              the Resend / Meta webhooks once they are configured.
            </p>
          ) : null}
          {data.daily.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data.daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="sent" name="Sent" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
                <Bar dataKey="delivered" name="Delivered" fill="#10b981" />
                <Bar dataKey="failed" name="Failed" fill="#ef4444" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
