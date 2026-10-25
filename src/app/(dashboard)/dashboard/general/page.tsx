"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Settings { fiscalMonthStartDay: number; defaultDateRangeDays: number; includeShippingRevenueInProfit: boolean; includeTaxesInProfit: boolean; includeAdSpendInProfit: boolean }

export default function GeneralPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fiscalMonthStartDay: 1, defaultDateRangeDays: 30, includeShippingRevenueInProfit: true, includeTaxesInProfit: false, includeAdSpendInProfit: true });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/settings/workspace");
      if (!res.ok) throw new Error("load failed");
      const s = (await res.json()).settings;
      setSettings(s);
      setForm({ fiscalMonthStartDay: s.fiscalMonthStartDay, defaultDateRangeDays: s.defaultDateRangeDays, includeShippingRevenueInProfit: s.includeShippingRevenueInProfit, includeTaxesInProfit: s.includeTaxesInProfit, includeAdSpendInProfit: s.includeAdSpendInProfit });
    } catch { setError("Could not load general settings. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/settings/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) { setMsg("Could not save general settings."); return; }
    setMsg("General settings saved. Note: the core profit formula itself never changes — these toggles are recorded as your profit-definition preference and are shown on the Report Guide; changing them does not rewrite historical reports.");
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 2 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error || !settings) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error ?? "No settings"}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">General</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Timezone lives on your workspace profile in Settings; fiscal month start, default date range, and profit-definition options live here.</p>
      </div>
      <Card><CardHeader><CardTitle>Workspace defaults</CardTitle></CardHeader><CardContent>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="gen-fiscal">Fiscal month start day</Label><Input id="gen-fiscal" type="number" min="1" max="28" value={form.fiscalMonthStartDay} onChange={(e) => setForm({ ...form, fiscalMonthStartDay: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="gen-range">Default date range (days)</Label><Input id="gen-range" type="number" min="7" max="365" value={form.defaultDateRangeDays} onChange={(e) => setForm({ ...form, defaultDateRangeDays: Number(e.target.value) })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includeShippingRevenueInProfit} onChange={(e) => setForm({ ...form, includeShippingRevenueInProfit: e.target.checked })} /> Include shipping revenue in profit definition</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includeTaxesInProfit} onChange={(e) => setForm({ ...form, includeTaxesInProfit: e.target.checked })} /> Include taxes in profit definition</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includeAdSpendInProfit} onChange={(e) => setForm({ ...form, includeAdSpendInProfit: e.target.checked })} /> Include ad spend in profit definition</label>
          <div className="sm:col-span-2"><Button type="submit">Save</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Data export &amp; deletion</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <p>Export every report as CSV from its own page (Export CSV button), or use Reports &amp; Export for the full set.</p>
        <p>To delete your data, use the account deletion flow on the data-deletion page: <Link href="/data-deletion" className="underline text-[var(--color-primary)]">Data deletion →</Link></p>
      </CardContent></Card>
    </div>
  );
}
