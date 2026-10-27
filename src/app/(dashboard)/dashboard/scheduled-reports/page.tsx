"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Report { id: string; name: string; report: string; format: string; frequency: string; channel: string; recipient: string; isDigest: boolean; lastSentAt?: string | null }

export default function ScheduledReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "Weekly digest", report: "profit_summary", format: "csv", frequency: "weekly", channel: "email", recipient: "", isDigest: true });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/scheduled-reports");
      if (!res.ok) throw new Error("load failed");
      setReports((await res.json()).reports ?? []);
    } catch { setError("Could not load scheduled reports. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/scheduled-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) { setMsg("Could not schedule that report — check the recipient and try again."); return; }
    setMsg("Scheduled. Delivery runs from the cron route /api/cron/scheduled-reports (weekly on Mondays, monthly on the 1st) — add it to your cron schedule with CRON_SECRET, see Manual Steps.");
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 2 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Scheduled Reports &amp; Weekly Digest</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Schedule PDF/CSV reports and the weekly digest by email or WhatsApp. Reports contain period summaries only, never order-level customer data.</p>
      </div>
      <Card><CardHeader><CardTitle>Schedule a report</CardTitle></CardHeader><CardContent>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="sr-name">Name</Label><Input id="sr-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="sr-report">Report</Label><select id="sr-report" value={form.report} onChange={(e) => setForm({ ...form, report: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="profit_summary">Profit summary</option><option value="revenue_by_date">Revenue by date</option><option value="countries">Country analysis</option></select></div>
          <div className="space-y-1"><Label htmlFor="sr-format">Format</Label><select id="sr-format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="csv">CSV</option><option value="pdf">PDF</option></select></div>
          <div className="space-y-1"><Label htmlFor="sr-freq">Frequency</Label><select id="sr-freq" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="weekly">Weekly (Monday)</option><option value="monthly">Monthly (1st)</option></select></div>
          <div className="space-y-1"><Label htmlFor="sr-channel">Channel</Label><select id="sr-channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="both">Both</option></select></div>
          <div className="space-y-1"><Label htmlFor="sr-recipient">Recipient (email or phone)</Label><Input id="sr-recipient" required value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDigest} onChange={(e) => setForm({ ...form, isDigest: e.target.checked })} /> This is the weekly digest</label>
          <div className="sm:col-span-2"><Button type="submit">Schedule</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Scheduled reports</CardTitle></CardHeader><CardContent className="space-y-2">
        {reports.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">Nothing scheduled yet. Schedule your first report above.</p>}
        {reports.map((r) => (<div key={r.id} className="text-sm border-b border-[var(--color-border)] pb-2 last:border-0"><p className="font-medium">{r.name}{r.isDigest ? " · digest" : ""}</p><p className="text-[var(--color-muted-foreground)]">{r.report} · {r.format.toUpperCase()} · {r.frequency} · {r.channel} → {r.recipient}{r.lastSentAt ? ` · last sent ${new Date(r.lastSentAt).toLocaleDateString()}` : " · never sent"}</p></div>))}
      </CardContent></Card>
    </div>
  );
}
