"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Leak { id: string; severity: string; title: string; detail: string; amount: number; actionLabel: string; actionHref: string }

export default function LeaksPage() {
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/analytics/leaks");
      if (!res.ok) throw new Error("load failed");
      const j = await res.json();
      setLeaks(j.leaks ?? []); setTotal(j.totalAtRisk ?? 0);
    } catch { setError("Could not load leak findings. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 4 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profit Leak Detector</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Every finding names a real amount from your orders. Fix the biggest leak first — it feeds Mission Control&apos;s action list.</p>
      </div>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Total at risk in this period</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(total)}</CardContent></Card>
      {leaks.length === 0 && (
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">No leaks found in this period. Keep COGS up to date and review high-risk orders to stay here.</p>
          <Link href="/dashboard/mission-control" className="text-sm font-medium text-[var(--color-primary)] underline">Back to Mission Control →</Link>
        </CardContent></Card>
      )}
      {leaks.map((l) => (
        <Card key={l.id}><CardContent className="py-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-52">
            <p className="font-medium text-sm">{l.title} <span className="text-xs text-[var(--color-muted-foreground)]">({l.severity})</span></p>
            <p className="text-xs text-[var(--color-muted-foreground)]">{l.detail}</p>
          </div>
          <span className="font-bold">{formatCurrency(l.amount)}</span>
          <Link href={l.actionHref} className="text-sm font-medium text-[var(--color-primary)] underline">{l.actionLabel} →</Link>
        </CardContent></Card>
      ))}
    </div>
  );
}
