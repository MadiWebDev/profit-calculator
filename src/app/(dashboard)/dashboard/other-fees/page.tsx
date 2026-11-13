"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import { FormSkeleton } from "@/components/ui/skeleton";
import { CURRENCIES as ALL_CURRENCIES, useCurrency } from "@/components/dashboard/CurrencyContext";

interface Rule { id: string; name: string; feeType: string; kind: string; value: number; currency?: string; country?: string; productTag?: string; paymentMethod?: string; effectiveFrom: string; effectiveTo?: string | null; preview: number }

export default function OtherFeesPage() {
  const { formatMoney, baseCurrency, currency: displayCurrency } = useCurrency();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", feeType: "packaging", kind: "fixed_per_order", value: "", currency: displayCurrency, country: "", productTag: "", paymentMethod: "", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "" });
  const [msg, setMsg] = useState<string | null>(null);
  // The fixed fee is typed in the currency the user is working in —
  // never a hardcoded USD. The display currency resolves after
  // mount; adopt it until the user picks another one.
  const currencyTouchedRef = useRef(false);

  useEffect(() => {
    if (!currencyTouchedRef.current) {
      setForm((f) => (f.currency === displayCurrency ? f : { ...f, currency: displayCurrency }));
    }
  }, [displayCurrency]);

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

  const submitAction = useAsyncAction(async () => {
    const res = await fetch("/api/other-fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, value: Number(form.value), country: form.country || undefined, productTag: form.productTag || undefined, paymentMethod: form.paymentMethod || undefined, effectiveTo: form.effectiveTo || undefined }) });
    if (!res.ok) { setMsg("Could not save that rule — check the fields and try again."); return; }
    setMsg("Rule saved. It is now applied to matching orders as an “Other fees” expense in P&L and in the profit API — the preview column shows what it charges on the last 30 days of orders.");
    setForm({ ...form, name: "", value: "", country: "", productTag: "", paymentMethod: "", effectiveTo: "" });
    await load();
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    void submitAction.run();
  };

  if (loading) return <FormSkeleton fields={6} />;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Other Fees</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Transaction and gateway fees, COD fees, packaging, handling and pick-pack, Shopify subscription share, returns processing, chargebacks, and custom per-order or per-percent fees — each with effective dates and optional country / payment-method / product-tag scoping. Saved rules are applied to matching orders: as an “Other fees” expense in P&amp;L and subtracted from profit in the profit API. A fixed fee is charged in the rule&apos;s currency and converted into the report base currency; a percent fee is a share of the order value. Country is the ISO code orders carry (e.g. PK). Product-tag scoping matches line-item tags — orders don&apos;t carry tags yet, so a rule with a product tag currently applies to no orders.</p>
      </div>
      <Card><CardHeader><CardTitle>Add a fee rule</CardTitle></CardHeader><CardContent>
        <form onSubmit={submit}>
          <fieldset disabled={submitAction.loading} className="grid sm:grid-cols-2 gap-3 border-0 m-0 min-w-0 p-0">
          <div className="space-y-1"><Label htmlFor="fee-name">Name</Label><Input id="fee-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Packaging per order" /></div>
          <div className="space-y-1"><Label htmlFor="fee-type">Fee type</Label><select id="fee-type" value={form.feeType} onChange={(e) => setForm({ ...form, feeType: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm">{["packaging", "handling", "cod", "gateway", "subscription", "returns", "chargeback", "custom"].map((t) => (<option key={t} value={t}>{t}</option>))}</select></div>
          <div className="space-y-1"><Label htmlFor="fee-kind">Kind</Label><select id="fee-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"><option value="fixed_per_order">Fixed per order</option><option value="percent">Percent of order value</option></select></div>
          <div className="space-y-1"><Label htmlFor="fee-value">Value</Label><Input id="fee-value" type="number" min="0" step="0.01" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="fee-currency">Currency <span className="text-[var(--color-muted-foreground)]">(fixed fee only)</span></Label><select id="fee-currency" required value={form.currency} onChange={(e) => { currencyTouchedRef.current = true; setForm({ ...form, currency: e.target.value }); }} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm">{ALL_CURRENCIES.map((c) => (<option key={c.code} value={c.code}>{c.label}</option>))}</select></div>
          <div className="space-y-1"><Label htmlFor="fee-country">Country (optional)</Label><Input id="fee-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="ISO code, e.g. PK — blank for all countries" /></div>
          <div className="space-y-1"><Label htmlFor="fee-payment">Payment method (optional)</Label><Input id="fee-payment" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} placeholder="e.g. COD — blank for all methods" /></div>
          <div className="space-y-1"><Label htmlFor="fee-tag">Product tag (optional)</Label><Input id="fee-tag" value={form.productTag} onChange={(e) => setForm({ ...form, productTag: e.target.value })} placeholder="Blank for all products" /></div>
          <div className="space-y-1"><Label htmlFor="fee-from">Effective from</Label><Input id="fee-from" type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="fee-to">Effective to <span className="text-[var(--color-muted-foreground)]">(optional)</span></Label><Input id="fee-to" type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="submit" loading={submitAction.loading} loadingText="Saving…">Save rule</Button>{msg && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{msg}</p>}</div>
          </fieldset>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Fee rules</CardTitle></CardHeader><CardContent className="space-y-2">
        {rules.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No fee rules yet. Add your first one above.</p>}
        {rules.map((r) => (<div key={r.id} className="flex justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0"><span>{r.name} · {r.feeType} · {r.kind === "percent" ? `${r.value}%` : formatMoney(r.value, r.currency ?? baseCurrency)}{r.country ? ` · ${r.country}` : ""}{r.paymentMethod ? ` · ${r.paymentMethod}` : ""}{r.productTag ? ` · tag: ${r.productTag}` : ""}{r.effectiveTo ? ` · until ${new Date(r.effectiveTo).toLocaleDateString()}` : ""}</span><span>Preview (30d): {formatMoney(r.preview, baseCurrency)}</span></div>))}
      </CardContent></Card>
    </div>
  );
}
