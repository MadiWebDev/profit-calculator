"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface View { id: string; name: string; role: string; kpis: string[]; shareToken?: string | null; shareExpiresAt?: string | null }

export default function SavedViewsPage() {
  const [views, setViews] = useState<View[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "all", kpis: [] as string[] });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/saved-views");
      if (!res.ok) throw new Error("load failed");
      const j = await res.json();
      setViews(j.views ?? []); setOptions(j.kpiOptions ?? []);
    } catch { setError("Could not load saved views. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleKpi = (k: string) => setForm((f) => ({ ...f, kpis: f.kpis.includes(k) ? f.kpis.filter((x) => x !== k) : [...f.kpis, k] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/saved-views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) { setMsg("Could not save that view — pick at least one KPI and try again."); return; }
    setMsg("View saved. Open it as a custom dashboard from the list below.");
    setForm({ name: "", role: "all", kpis: [] });
    await load();
  };

  const share = async (id: string) => {
    const res = await fetch(`/api/saved-views/${id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 30 }) });
    if (!res.ok) { setMsg("Could not create a share link for that view."); return; }
    const j = await res.json();
    setMsg(`Share link created (expires ${new Date(j.expiresAt).toLocaleDateString()}): /shared/${j.token} — paste it after your site domain. It shows aggregates only, never order-level data.`);
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 2 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Saved Views &amp; Custom Dashboards</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Pick the KPIs that matter for a role, save the view, open it as a custom dashboard, or share a read-only link that expires.</p>
      </div>
      <Card><CardHeader><CardTitle>Save a view</CardTitle></CardHeader><CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="view-name">Name</Label><Input id="view-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Owner morning brief" /></div>
          <div className="flex flex-wrap gap-2">
            {options.map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] rounded-full px-3 py-1"><input type="checkbox" checked={form.kpis.includes(k)} onChange={() => toggleKpi(k)} /> {k}</label>
            ))}
          </div>
          <Button type="submit">Save view</Button>
          {msg && <p className="text-sm text-[var(--color-muted-foreground)]">{msg}</p>}
        </form>
      </CardContent></Card>
      {views.length === 0 && <Card><CardContent className="py-10 text-center"><p className="text-sm text-[var(--color-muted-foreground)]">No saved views yet. Save your first one above.</p></CardContent></Card>}
      {views.map((v) => (
        <Card key={v.id}><CardContent className="py-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-52">
            <p className="font-medium text-sm">{v.name} <span className="text-xs text-[var(--color-muted-foreground)]">· {v.role}</span></p>
            <p className="text-xs text-[var(--color-muted-foreground)]">{v.kpis.join(", ")}</p>
          </div>
          <Link href={`/dashboard/custom-dashboard?view=${v.id}`} className="text-sm font-medium text-[var(--color-primary)] underline">Open dashboard →</Link>
          <Button size="sm" variant="outline" onClick={() => share(v.id)}>Share (30d)</Button>
        </CardContent></Card>
      ))}
    </div>
  );
}
