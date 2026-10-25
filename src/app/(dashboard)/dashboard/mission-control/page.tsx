"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Action { title: string; detail: string; amount: number; actionLabel: string; actionHref: string }
interface Integration { name: string; status: string; lastSuccess: string | null; error: string | null }
interface HealthPart { label: string; pct: number; fix: string; href: string }

interface Data {
  today: { netProfit: number; revenue: number; orderCount: number };
  target: number; targetProgress: number;
  actions: Action[]; integrations: Integration[];
  anomalies: { date: string; detail: string }[];
  healthScore: number; healthParts: HealthPart[];
}

export default function MissionControlPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/analytics/mission-control");
      if (!res.ok) throw new Error("load failed");
      setData(await res.json());
    } catch { setError("Could not load Mission Control. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-3 gap-4" role="status" aria-label="Loading">{Array.from({ length: 6 }).map((_, i) => (<Card key={i}><CardContent className="h-24 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error || !data) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error ?? "No data"}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mission Control</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Today&apos;s live profit, the five most important actions now, integration health, anomalies, and your data health score.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Today&apos;s profit</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(data.today.netProfit)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Today&apos;s revenue</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(data.today.revenue)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Profit target</CardTitle></CardHeader><CardContent className="text-xl font-bold">{data.target > 0 ? formatCurrency(data.target) : "No goal set"}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Target progress</CardTitle></CardHeader><CardContent className="text-xl font-bold">{data.target > 0 ? `${data.targetProgress}%` : "Set a goal"}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>5 most important actions now</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.actions.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">Nothing urgent — no loss-making campaigns, negative-margin products, or unreviewed high-risk orders found.</p>}
          {data.actions.map((a) => (
            <div key={a.title} className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] pb-3 last:border-0">
              <div className="flex-1 min-w-52">
                <p className="font-medium text-sm">{a.title}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">{a.detail}</p>
              </div>
              <Link href={a.actionHref} className="text-sm font-medium text-[var(--color-primary)] underline">{a.actionLabel} →</Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Integration health</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.integrations.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No stores or ad accounts connected yet. <Link href="/dashboard/settings?tab=stores" className="underline text-[var(--color-primary)]">Connect a store</Link></p>}
            {data.integrations.map((i) => (
              <div key={i.name} className="flex justify-between gap-3 text-sm">
                <span>{i.name}</span>
                <span className="text-[var(--color-muted-foreground)]">{i.status}{i.lastSuccess ? ` · last ${new Date(i.lastSuccess).toLocaleDateString()}` : ""}{i.error ? ` · ${i.error}` : ""}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Data health score: {data.healthScore}/100</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.healthParts.map((h) => (
              <div key={h.label} className="text-sm">
                <p>{h.label}: {h.pct}%</p>
                {h.pct < 100 && <p className="text-xs text-[var(--color-muted-foreground)]">{h.fix} — <Link href={h.href} className="underline text-[var(--color-primary)]">Fix</Link></p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Anomaly feed</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.anomalies.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No day-over-day swings over 30% in the current period.</p>}
          {data.anomalies.map((a) => (<p key={a.date} className="text-sm">{a.date}: {a.detail}</p>))}
        </CardContent>
      </Card>
    </div>
  );
}
