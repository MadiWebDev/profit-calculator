"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Rule { id: string; name: string; feeType: string; kind: string; value: number; country?: string; paymentMethod?: string; preview: number }

export default function OtherFeesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", feeType: "packaging", kind: "fixed_per_order", value: "", country: "", paymentMethod: "", effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/other-fees");
      if (!res.ok) throw new Error("load failed");
      setRules((await res.json()).rules ?? []);
    } catch { setError("Could not load fee rules. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/other-fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, value: Number(form.value), country: form.country || undefined, paymentMethod: form.paymentMethod || undefined }) });
    if (!res.ok) { setMsg("Could not save that rule — check the fields and try again."); return; }
    setMsg("Rule saved with its effective date. The preview column shows what it would charge on the last 30 days of orders.");
    setForm({ ...form, name: "", value: "" });
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 3 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Other Fees</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Transaction and gateway fees, COD fees, packaging, handling and pick-pack, Shopify subscription share, returns processing, chargebacks, and custom per-order or per-percent fees — each with effective dates and optional country / payment-method scoping.</p>
      </div>
      <Card><CardHeader><CardTitle>Add a fee rule</CardTitle></CardHeader><CardContent>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="fee-name">Name</Label><Input id="fee-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Packaging per order" /></div>
          <div className="space-y-1"><Label htmlFor="fee-type">Fee type</Label><select id="fee-type" value={form.feeType} onChange={(e) => setForm({ ...form, feeType: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm">{["packaging", "handling", "cod", "gateway", "subscription", "returns", "chargeback", "custom"].map((t) => (<option key={t} value={t}>{t}</option>))}</select></div>
          <div className="space-y-1"><Label htmlFor="fee-kind">Kind</Label><select id="fee-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="fixed_per_order">Fixed per order</option><option value="percent">Percent of order value</option></select></div>
          <div className="space-y-1"><Label htmlFor="fee-value">Value</Label><Input id="fee-value" type="number" min="0" step="0.01" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="fee-country">Country (optional)</Label><Input id="fee-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Leave blank for all countries" /></div>
          <div className="space-y-1"><Label htmlFor="fee-from">Effective from</Label><Input id="fee-from" type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="submit">Save rule</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Fee rules</CardTitle></CardHeader><CardContent className="space-y-2">
        {rules.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No fee rules yet. Add your first one above.</p>}
        {rules.map((r) => (<div key={r.id} className="flex justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0"><span>{r.name} · {r.feeType} · {r.kind === "percent" ? `${r.value}%` : formatCurrency(r.value)}{r.country ? ` · ${r.country}` : ""}</span><span>Preview (30d): {formatCurrency(r.preview)}</span></div>))}
      </CardContent></Card>
    </div>
  );
}
