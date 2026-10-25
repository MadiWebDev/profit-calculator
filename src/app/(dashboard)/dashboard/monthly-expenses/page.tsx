"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Expense { id: string; name: string; category: string; amount: number; currency: string; startDate: string; endDate?: string | null; isRecurring: boolean; allocation: string }

export default function MonthlyExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allocated, setAllocated] = useState(0);
  const [before, setBefore] = useState(0);
  const [after, setAfter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "Software", amount: "", startDate: new Date().toISOString().slice(0, 10), isRecurring: true, allocation: "per_day" });
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/monthly-expenses");
      if (!res.ok) throw new Error("load failed");
      const j = await res.json();
      setExpenses(j.expenses ?? []); setAllocated(j.allocated ?? 0); setBefore(j.profitBeforeOpex ?? 0); setAfter(j.profitAfterOpex ?? 0);
    } catch { setError("Could not load monthly expenses. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/monthly-expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount), currency: "USD" }) });
    if (!res.ok) { setMsg("Could not save that expense — check the fields and try again."); return; }
    setMsg("Expense saved. It is allocated into the last 30 days above and into Revenue By Date / P&L as profit after operating expenses.");
    setForm({ ...form, name: "", amount: "" });
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 3 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Monthly Expenses</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Recurring and one-off operating costs (rent, salaries, software, agency, freelancers, shipping subscriptions). Allocated per day into the period below — profit before and after operating expenses are both shown, so the headline profit formula never changes silently.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Allocated (last 30 days)</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(allocated)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Profit before operating expenses</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(before)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Profit after operating expenses</CardTitle></CardHeader><CardContent className="text-xl font-bold">{formatCurrency(after)}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Add an expense</CardTitle></CardHeader><CardContent>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="exp-name">Name</Label><Input id="exp-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shopify apps" /></div>
          <div className="space-y-1"><Label htmlFor="exp-category">Category</Label><Input id="exp-category" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="exp-amount">Amount</Label><Input id="exp-amount" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="exp-start">Start date</Label><Input id="exp-start" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="exp-alloc">Allocation</Label><select id="exp-alloc" value={form.allocation} onChange={(e) => setForm({ ...form, allocation: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="per_day">Per day</option><option value="per_order">Per order</option><option value="by_revenue">By revenue share</option></select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })} /> Recurring</label>
          <div className="sm:col-span-2"><Button type="submit">Save expense</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Expenses</CardTitle></CardHeader><CardContent className="space-y-2">
        {expenses.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No expenses yet. Add your first one above — rent, salaries, or software.</p>}
        {expenses.map((e) => (<div key={e.id} className="flex justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0"><span>{e.name} · {e.category}{e.isRecurring ? " · recurring" : ""}</span><span>{formatCurrency(e.amount)} · {e.allocation}</span></div>))}
      </CardContent></Card>
    </div>
  );
}
