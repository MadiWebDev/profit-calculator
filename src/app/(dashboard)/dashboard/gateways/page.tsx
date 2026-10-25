"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Gateway { gateway: string; orders: number; revenue: number; recordedFees: number; recomputed: number | null; delta: number | null; rule: { percent: number; fixed: number; currency: string; payoutDelayDays: number; codHandling: string } | null }

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ gateway: "", currency: "USD", percent: "", fixed: "", payoutDelayDays: "0", effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/gateways");
      if (!res.ok) throw new Error("load failed");
      setGateways((await res.json()).gateways ?? []);
    } catch { setError("Could not load gateways. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/gateways", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, percent: Number(form.percent), fixed: Number(form.fixed), payoutDelayDays: Number(form.payoutDelayDays) }) });
    if (!res.ok) { setMsg("Could not save that fee schedule — check the fields and try again."); return; }
    setMsg("Fee schedule saved. The recompute preview below now reflects it.");
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 3 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Gateways</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Payment gateways detected from your orders, with fee percent + fixed fee per gateway and per currency, COD handling, and payout delay. The recompute preview shows what the saved schedule would charge on the last 30 days, next to what was actually recorded.</p>
      </div>
      <Card><CardHeader><CardTitle>Save a fee schedule</CardTitle></CardHeader><CardContent>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="gw-name">Gateway (as it appears on orders)</Label><Input id="gw-name" required value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} placeholder="e.g. Stripe, COD" /></div>
          <div className="space-y-1"><Label htmlFor="gw-cur">Currency</Label><Input id="gw-cur" required value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="gw-pct">Fee percent</Label><Input id="gw-pct" type="number" min="0" max="100" step="0.01" required value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="gw-fixed">Fixed fee per order</Label><Input id="gw-fixed" type="number" min="0" step="0.01" required value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="gw-delay">Payout delay (days)</Label><Input id="gw-delay" type="number" min="0" value={form.payoutDelayDays} onChange={(e) => setForm({ ...form, payoutDelayDays: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="gw-from">Effective from</Label><Input id="gw-from" type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="submit">Save schedule</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Gateways in the last 30 days</CardTitle></CardHeader><CardContent className="space-y-2">
        {gateways.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No orders with a payment method in the last 30 days. Connect a store or import orders first.</p>}
        {gateways.map((g) => (<div key={g.gateway} className="text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
          <p className="font-medium">{g.gateway} · {g.orders} orders · {formatCurrency(g.revenue)} revenue</p>
          <p className="text-[var(--color-muted-foreground)]">Recorded fees: {formatCurrency(g.recordedFees)}{g.rule ? ` · Rule: ${g.rule.percent}% + ${formatCurrency(g.rule.fixed)} · Payout delay: ${g.rule.payoutDelayDays}d · COD: ${g.rule.codHandling}` : " · No fee schedule saved yet"}{g.recomputed !== null ? ` · Recomputed: ${formatCurrency(g.recomputed)} (delta ${formatCurrency(g.delta ?? 0)})` : ""}</p>
        </div>))}
      </CardContent></Card>
    </div>
  );
}
