"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Settings { reportingCurrency: string; fxSource: string; fxOverrides: { currency: string; rate: number; effectiveFrom: string }[] }

export default function CurrencyPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ reportingCurrency: "USD", fxSource: "open.er-api.com", currency: "", rate: "", effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/settings/workspace");
      if (!res.ok) throw new Error("load failed");
      const s = (await res.json()).settings;
      setSettings(s);
      setForm((f) => ({ ...f, reportingCurrency: s.reportingCurrency, fxSource: s.fxSource }));
    } catch { setError("Could not load currency settings. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const overrides = [...(settings?.fxOverrides ?? [])];
    if (form.currency && form.rate) {
      overrides.push({ currency: form.currency.toUpperCase(), rate: Number(form.rate), effectiveFrom: form.effectiveFrom });
    }
    const res = await fetch("/api/settings/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportingCurrency: form.reportingCurrency, fxSource: form.fxSource, fxOverrides: overrides }) });
    if (!res.ok) { setMsg("Could not save currency settings."); return; }
    setMsg("Currency settings saved. Manual overrides apply from their effective date and are recorded in the history below.");
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 2 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error || !settings) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error ?? "No settings"}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Currency</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Reporting currency, FX source, and manual rate overrides with effective dates. Store and ad-account currencies are shown on the Stores and Ad Platforms pages; reports filter by order currency and never mix currencies in one total.</p>
      </div>
      <Card><CardHeader><CardTitle>Reporting currency &amp; FX</CardTitle></CardHeader><CardContent>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="cur-report">Reporting currency</Label><Input id="cur-report" required value={form.reportingCurrency} onChange={(e) => setForm({ ...form, reportingCurrency: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1"><Label htmlFor="cur-source">FX source</Label><Input id="cur-source" value={form.fxSource} onChange={(e) => setForm({ ...form, fxSource: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="cur-override">Manual override currency</Label><Input id="cur-override" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="Optional, e.g. PKR" /></div>
          <div className="space-y-1"><Label htmlFor="cur-rate">Rate (units per 1 USD)</Label><Input id="cur-rate" type="number" min="0" step="0.0001" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="cur-from">Effective from</Label><Input id="cur-from" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="submit">Save</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Rate overrides used</CardTitle></CardHeader><CardContent className="space-y-2">
        {settings.fxOverrides.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No manual overrides yet — live FX rates from the source above are used.</p>}
        {settings.fxOverrides.map((o, i) => (<p key={i} className="text-sm">{o.currency}: {o.rate} from {new Date(o.effectiveFrom).toLocaleDateString()}</p>))}
      </CardContent></Card>
    </div>
  );
}
