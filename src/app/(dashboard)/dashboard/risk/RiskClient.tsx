"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface Stats {
  byBand: Record<string, number>;
  byStatus: Record<string, number>;
  reviewed: number;
  precision: number;
  moneySaved: number;
  valueProtected: number;
  realisedRtoLoss: number;
}

interface RiskOrder {
  id: string;
  orderNumber?: string;
  riskScore?: number;
  riskBand?: string;
  riskReasons?: { code: string; label: string; points: number; detail: string }[];
  riskStatus?: string;
  riskHoldFulfillment?: boolean;
  grossRevenue?: number;
  customerEmail?: string;
}

export function RiskClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<RiskOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, q] = await Promise.all([
        fetch("/api/risk/stats").then((r) => {
          if (!r.ok) throw new Error("stats");
          return r.json();
        }),
        fetch("/api/risk/review?limit=50").then((r) => {
          if (!r.ok) throw new Error("queue");
          return r.json();
        }),
      ]);
      setStats(s);
      setOrders(q.orders ?? []);
    } catch {
      setError("Could not load the review queue. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data load on mount; no SSR alternative for an authenticated fetch */
  useEffect(() => {
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const verdict = async (orderId: string, v: "fake" | "genuine") => {
    setActing(orderId);
    try {
      const res = await fetch("/api/risk/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, verdict: v }),
      });
      if (!res.ok) throw new Error("verdict failed");
      await load();
    } catch {
      setError("Could not save that verdict. Please try again.");
    } finally {
      setActing(null);
    }
  };

  const backfill = async () => {
    setActing("backfill");
    try {
      await fetch("/api/risk/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await load();
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Risk Review</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Every score shows its reasons. High and critical orders are tagged in Shopify and held from fulfilment until you review them.
          </p>
        </div>
        <Button variant="outline" className="ml-auto" onClick={backfill} disabled={acting === "backfill"}>
          Score historical orders
        </Button>
      </div>

      {error && <Card><CardContent className="py-6 text-center text-sm text-red-600">{error}</CardContent></Card>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">High + critical</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold tabular-nums">{(stats.byBand.high ?? 0) + (stats.byBand.critical ?? 0)}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Awaiting review</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold tabular-nums">{stats.byStatus.unreviewed ?? 0}</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Precision (reviewed)</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold tabular-nums">{stats.precision}%</p><p className="text-xs text-[var(--color-muted-foreground)]">{stats.reviewed} reviewed</p></CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Money saved</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold tabular-nums">{formatCurrency(stats.moneySaved)}</p><p className="text-xs text-[var(--color-muted-foreground)]">Value protected: {formatCurrency(stats.valueProtected)} · RTO loss realised: {formatCurrency(stats.realisedRtoLoss)}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Review queue (riskiest first)</CardTitle></CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-[var(--color-muted-foreground)]" role="status">Loading…</p>}
          {!loading && orders.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No scored orders yet. New orders are scored automatically on arrival; use “Score historical orders” for older ones.
            </p>
          )}
          <ul className="space-y-4">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-[var(--color-border)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{o.orderNumber ?? o.id}</span>
                  <Badge variant={o.riskBand === "critical" ? "destructive" : o.riskBand === "high" ? "warning" : "outline"}>
                    {o.riskBand} · {o.riskScore}
                  </Badge>
                  {o.riskHoldFulfillment && <Badge variant="destructive">Hold fulfilment</Badge>}
                  <Badge variant="outline">{o.riskStatus}</Badge>
                  <span className="ml-auto text-sm tabular-nums">{formatCurrency(o.grossRevenue ?? 0)}</span>
                </div>
                {o.customerEmail && <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{o.customerEmail}</p>}
                <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                  {(o.riskReasons ?? []).map((r) => (
                    <li key={r.code}>• {r.label} (+{r.points}) — {r.detail}</li>
                  ))}
                </ul>
                {o.riskStatus === "unreviewed" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" disabled={acting === o.id} onClick={() => verdict(o.id, "genuine")}>
                      Confirm genuine
                    </Button>
                    <Button size="sm" variant="destructive" disabled={acting === o.id} onClick={() => verdict(o.id, "fake")}>
                      Mark fake
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
