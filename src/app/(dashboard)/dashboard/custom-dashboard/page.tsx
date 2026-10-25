"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

function CustomDashboardInner() {
  const params = useSearchParams();
  const viewId = params.get("view");
  const [view, setView] = useState<{ name: string; kpis: string[] } | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        if (!viewId) throw new Error("no view");
        const [vr, pr] = await Promise.all([fetch("/api/saved-views"), fetch("/api/analytics/profit")]);
        if (!vr.ok || !pr.ok) throw new Error("load failed");
        const vj = await vr.json();
        const found = (vj.views ?? []).find((v: { id: string }) => v.id === viewId);
        if (!found) throw new Error("view not found");
        setView(found);
        const pj = await pr.json();
        setMetrics({
          revenue: pj.metrics.revenue, netProfit: pj.metrics.netProfit, netMargin: pj.metrics.netMargin,
          orderCount: pj.metrics.orderCount, aov: pj.metrics.aov, adSpend: pj.metrics.adSpend,
          roas: pj.metrics.roas, refundRate: pj.metrics.returnRate, rtoRate: pj.metrics.rtoRate,
          cogs: pj.metrics.totalCosts - pj.metrics.adSpend,
        });
      } catch { setError("Could not load that custom dashboard. Save a view first, then open it from Saved Views."); }
      finally { setLoading(false); }
    })();
  }, [viewId]);

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="status" aria-label="Loading">{Array.from({ length: 4 }).map((_, i) => (<Card key={i}><CardContent className="h-24 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error || !view || !metrics) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error ?? "No dashboard"}</p><Link href="/dashboard/saved-views" className="text-sm font-medium text-[var(--color-primary)] underline">Go to Saved Views →</Link></CardContent></Card>;

  const fmt = (k: string, v: number) => {
    if (k === "netMargin" || k === "refundRate" || k === "rtoRate") return `${v}%`;
    if (k === "orderCount") return String(v);
    if (k === "roas") return `${v}x`;
    return formatCurrency(v);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{view.name}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Custom dashboard — last 30 days, from the same True Profit totals as the main dashboard.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {view.kpis.map((k) => (
          <Card key={k}><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">{k}</CardTitle></CardHeader><CardContent className="text-xl font-bold">{fmt(k, metrics[k] ?? 0)}</CardContent></Card>
        ))}
      </div>
      <Button variant="outline" asChild><Link href="/dashboard/saved-views">Back to Saved Views</Link></Button>
    </div>
  );
}

export default function CustomDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-muted-foreground)]">Loading dashboard…</p>}>
      <CustomDashboardInner />
    </Suspense>
  );
}
