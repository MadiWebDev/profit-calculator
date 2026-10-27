"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Settings { taxMode: string; reverseCharge: boolean; vatRates: { country: string; rate: number }[] }

export default function TaxPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ taxMode: "exclusive", reverseCharge: false, country: "", rate: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/settings/workspace");
      if (!res.ok) throw new Error("load failed");
      const s = (await res.json()).settings;
      setSettings(s);
      setForm((f) => ({ ...f, taxMode: s.taxMode, reverseCharge: s.reverseCharge }));
    } catch { setError("Could not load tax settings. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const vatRates = [...(settings?.vatRates ?? [])];
    if (form.country && form.rate) vatRates.push({ country: form.country, rate: Number(form.rate) });
    const res = await fetch("/api/settings/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taxMode: form.taxMode, reverseCharge: form.reverseCharge, vatRates }) });
    if (!res.ok) { setMsg("Could not save tax settings."); return; }
    setMsg("Tax settings saved. Taxes remain pass-through in profit: they are collected for the government and never counted as revenue or cost, in either mode.");
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 2 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error || !settings) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error ?? "No settings"}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Tax / VAT</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Tax-inclusive or tax-exclusive mode, VAT/GST per country, and reverse charge. VAT-aware reporting: in inclusive mode the tax portion is split out of gross revenue before profit is computed (see the Report Guide); in exclusive mode taxes are a pass-through memo.</p>
      </div>
      <Card><CardHeader><CardTitle>Tax mode &amp; VAT rates</CardTitle></CardHeader><CardContent>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="tax-mode">Mode</Label><select id="tax-mode" value={form.taxMode} onChange={(e) => setForm({ ...form, taxMode: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="exclusive">Tax-exclusive</option><option value="inclusive">Tax-inclusive</option></select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reverseCharge} onChange={(e) => setForm({ ...form, reverseCharge: e.target.checked })} /> Reverse charge enabled</label>
          <div className="space-y-1"><Label htmlFor="vat-country">Add VAT country</Label><Input id="vat-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Optional, e.g. Pakistan" /></div>
          <div className="space-y-1"><Label htmlFor="vat-rate">VAT rate %</Label><Input id="vat-rate" type="number" min="0" max="100" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="submit">Save</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>VAT rates</CardTitle></CardHeader><CardContent className="space-y-2">
        {settings.vatRates.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No per-country VAT rates set yet.</p>}
        {settings.vatRates.map((v, i) => (<p key={i} className="text-sm">{v.country}: {v.rate}%</p>))}
        <p className="text-xs text-[var(--color-muted-foreground)]">VAT report export: use the P&amp;L page&apos;s date range and the tax memo column, or export Revenue By Date as CSV and sum the tax memo from your orders export.</p>
      </CardContent></Card>
    </div>
  );
}
