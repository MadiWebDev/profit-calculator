"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface Metrics {
  revenue: number; netProfit: number; netMargin: number; orderCount: number;
  aov: number; adSpend: number; roas: number; mer: number; breakEvenRoas: number;
  cac: number; ltv: number; returnRate: number; rtoRate: number;
  cashCollected: number; cashPending: number;
}

interface ProductRow {
  productId: string; name: string; revenue: number; grossProfit: number;
  margin: number; units: number;
}

interface ProfitData {
  metrics: Metrics; deltas: Record<string, number>;
  winners: ProductRow[]; losers: ProductRow[];
}

function deltaBadge(v: number | undefined): React.ReactNode {
  if (v === undefined) return null;
  const good = v >= 0;
  return (
    <Badge variant={good ? "success" : "destructive"} className="text-[10px]">
      {good ? "▲" : "▼"} {Math.abs(v)}% vs prev
    </Badge>
  );
}

export function ProfitClient() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/profit?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed to load profit data");
      setData(await res.json());
    } catch {
      setError("Could not load profit data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial data load on mount; no SSR alternative for an authenticated fetch */
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const exportCsv = () => {
    // File download (not navigation): trigger via a temporary anchor.
    const a = document.createElement("a");
    a.href = `/api/analytics/profit?from=${from}&to=${to}&format=csv`;
    a.download = "";
    a.click();
  };

  const m = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">True Profit</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Revenue after discounts, minus refunds, COGS, shipping, fees, packaging, ad spend, RTO loss and allocated expenses.
          </p>
        </div>
        <div className="flex items-end gap-3 ml-auto">
          <div className="space-y-1">
            <Label htmlFor="profit-from">From</Label>
            <Input id="profit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="profit-to">To</Label>
            <Input id="profit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={load} disabled={loading}>Apply</Button>
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="status" aria-label="Loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="h-24 animate-pulse bg-[var(--color-muted)]/40" /></Card>
          ))}
        </div>
      )}

      {error && !loading && (
        <Card><CardContent className="py-8 text-center text-sm text-red-600">{error}</CardContent></Card>
      )}

      {!loading && !error && !m && (
        <Card><CardContent className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
          No orders in this period. Connect your Shopify store or import orders to see true profit here.
        </CardContent></Card>
      )}

      {!loading && m && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {([
              ["Revenue", formatCurrency(m.revenue), data.deltas.revenue],
              ["Net profit", formatCurrency(m.netProfit), data.deltas.netProfit],
              ["Margin", `${m.netMargin}%`, undefined],
              ["Orders", String(m.orderCount), data.deltas.orderCount],
              ["AOV", formatCurrency(m.aov), data.deltas.aov],
              ["ROAS", `${m.roas}x`, undefined],
              ["Break-even ROAS", `${m.breakEvenRoas}x`, undefined],
              ["CAC", formatCurrency(m.cac), undefined],
              ["LTV (profit)", formatCurrency(m.ltv), undefined],
              ["Return rate", `${m.returnRate}%`, undefined],
              ["RTO rate", `${m.rtoRate}%`, undefined],
              ["COD cash pending", formatCurrency(m.cashPending), undefined],
            ] as const).map(([label, value, delta]) => (
              <Card key={label}>
                <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">{label}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xl font-bold tabular-nums">{value}</p>
                  {delta !== undefined && <div className="mt-1">{deltaBadge(delta)}</div>}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Winners</CardTitle></CardHeader>
              <CardContent>
                {data.winners.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No product data yet.</p>}
                <ul className="space-y-2 text-sm">
                  {data.winners.map((p) => (
                    <li key={p.productId} className="flex justify-between gap-2">
                      <span className="truncate">{p.name} <span className="text-[var(--color-muted-foreground)]">×{p.units}</span></span>
                      <span className="tabular-nums font-semibold">{formatCurrency(p.grossProfit)} ({p.margin}%)</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Losers</CardTitle></CardHeader>
              <CardContent>
                {data.losers.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No product data yet.</p>}
                <ul className="space-y-2 text-sm">
                  {data.losers.map((p) => (
                    <li key={p.productId} className="flex justify-between gap-2">
                      <span className="truncate">{p.name} <span className="text-[var(--color-muted-foreground)]">×{p.units}</span></span>
                      <span className="tabular-nums font-semibold">{formatCurrency(p.grossProfit)} ({p.margin}%)</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-[var(--color-muted-foreground)]">
            COD cash collected this period: {formatCurrency(m.cashCollected)} · MER: {m.mer}x ·
            Profit figures exclude cancelled orders. Taxes are pass-through and never count as profit.
          </p>
        </>
      )}
    </div>
  );
}
