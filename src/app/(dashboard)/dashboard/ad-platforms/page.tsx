"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Platform { platform: string; accountName: string; currency: string; lastSyncAt: string | null; syncStatus: string; dashboardSpend: number; daysCovered: number }

export default function AdPlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [dashboardTotal, setDashboardTotal] = useState(0);
  const [allocated, setAllocated] = useState(0);
  const [delta, setDelta] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/analytics/ad-health");
      if (!res.ok) throw new Error("load failed");
      const j = await res.json();
      setPlatforms(j.platforms ?? []); setDashboardTotal(j.dashboardSpendTotal ?? 0); setAllocated(j.allocatedSpendTotal ?? 0); setDelta(j.reconciliationDelta ?? 0);
    } catch { setError("Could not load ad platform health. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 3 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ad Platforms</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Per-platform health: dashboard spend, last sync, days covered, and the reconciliation delta against ad spend allocated to orders. A non-zero delta means some dashboard spend has no UTM-attributed order yet — it is shown, not hidden.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Dashboard spend (30d)</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(dashboardTotal)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Allocated to orders</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(allocated)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Reconciliation delta</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(delta)}</CardContent></Card>
      </div>
      {platforms.length === 0 && (
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">No ad accounts connected yet. Connect Meta, Google, TikTok, Pinterest or Snapchat to see per-platform health.</p>
          <Link href="/dashboard/settings?tab=ad-accounts" className="text-sm font-medium text-[var(--color-primary)] underline">Connect an ad account →</Link>
        </CardContent></Card>
      )}
      {platforms.map((p) => (
        <Card key={`${p.platform}-${p.accountName}`}><CardContent className="py-4 flex flex-wrap justify-between gap-3 text-sm">
          <span className="font-medium">{p.platform} · {p.accountName}</span>
          <span className="text-[var(--color-muted-foreground)]">Status: {p.syncStatus} · Last sync: {p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleDateString() : "never"} · Days covered: {p.daysCovered} · Spend: {formatCurrency(p.dashboardSpend)} {p.currency}</span>
        </CardContent></Card>
      ))}
      <p className="text-xs text-[var(--color-muted-foreground)]">Campaign profit ranking lives on the Ad Spend page, which ranks campaigns by true profit and break-even ROAS. This page is the health check on top of it.</p>
    </div>
  );
}
