"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatsSkeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { useCurrency } from "@/components/dashboard/CurrencyContext";
import { planBulkApplyPercent } from "@/lib/product-aggregates";

interface Product { id: string; name: string; sku?: string; defaultCogs: number; currency?: string; totalRevenue: number; totalOrders: number; avgProfitMargin: number; avgPrice: number; avgPriceInProductCurrency?: number | null }
interface Rule { productName: string; cogs: number; currency?: string; history?: { cogs: number; effectiveFrom: string }[] }

export default function CogsHubPage() {
  const { formatMoney, baseCurrency } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingOnly, setMissingOnly] = useState(false);
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [pr, cr] = await Promise.all([fetch("/api/products"), fetch("/api/cogs")]);
      if (!pr.ok || !cr.ok) throw new Error("load failed");
      const pj = await pr.json(); const cj = await cr.json();
      setProducts(pj.products ?? []); setRules(cj.rules ?? []);
    } catch { setError("Could not load COGS Hub. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const ruleFor = (p: Product) => rules.find((r) => r.productName === p.name);
  const rows = products.map((p) => {
    const rule = ruleFor(p);
    const cogs = rule ? rule.cogs : p.defaultCogs;
    // COGS is stored in the rule's (or the product's) own currency —
    // never relabelled as base currency (slice B §8b).
    const cogsCurrency = rule?.currency ?? p.currency ?? baseCurrency;
    // avgPrice comes from the order-computed aggregates in
    // GET /api/products (total revenue / total orders); fall back to
    // the same division on the returned totals if it is ever missing.
    const avgPrice = Number.isFinite(p.avgPrice)
      ? p.avgPrice
      : p.totalOrders > 0
        ? p.totalRevenue / p.totalOrders
        : 0;
    // The price Apply-% writes from: the average price expressed in
    // the PRODUCT's own currency, because defaultCogs is stored in
    // product currency. The API sends avgPriceInProductCurrency; when
    // it is absent (older response shape) fall back to the base avg
    // price only when the product's currency IS the base — otherwise
    // null, and the planner skips the product instead of writing a
    // base-denominated number as foreign-currency COGS.
    const productCurrency = p.currency ?? baseCurrency;
    const applyAvgPrice =
      typeof p.avgPriceInProductCurrency === "number"
        ? p.avgPriceInProductCurrency
        : productCurrency === baseCurrency
          ? avgPrice
          : null;
    return {
      ...p, cogs, cogsCurrency, avgPrice, applyAvgPrice,
      // Margin compares like with like: the product-currency average
      // price against the product-currency COGS. (When a COGS rule
      // exists in a different currency than the product, the COGS
      // side is in rule currency — that pre-existing mixed case is
      // a Phase 2 display item.)
      margin: typeof applyAvgPrice === "number" && applyAvgPrice > 0 ? Math.round(((applyAvgPrice - cogs) / applyAvgPrice) * 100 * 100) / 100 : 0,
      source: rule ? "COGS rule" : p.defaultCogs > 0 ? "Product default" : "Missing",
      lastChanged: rule?.history?.[rule.history.length - 1]?.effectiveFrom ?? null,
    };
  }).filter((r) => !missingOnly || r.cogs <= 0);
  const missing = rows.filter((r) => r.cogs <= 0).length;

  const exportCsv = () => {
    const header = "product,sku,cogs,avgPrice,margin,source";
    const body = rows.map((r) => [r.name, r.sku ?? "", r.cogs, r.avgPrice, r.margin, r.source].join(",")).join("\n");
    const blob = new Blob([[header, body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "cogs-hub.csv"; a.click();
  };

  const applyPercent = async () => {
    const n = Number(pct);
    if (!Number.isFinite(n)) return;
    setBusy(true); setNote(null);
    try {
      // Plan first: products with no average price yet (no orders) are
      // SKIPPED, never written as defaultCogs: 0 — writing 0 would wipe
      // a merchant-entered COGS (the old code did exactly that, because
      // the stored aggregates were always 0). The plan also skips
      // products whose average price could not be expressed in their
      // own currency (FX rate unavailable) — writing the base-currency
      // number as foreign-currency COGS would be wrong money. The
      // price planned from is the product-currency average (see
      // planBulkApplyPercent / avgPriceInCurrency).
      const plan = planBulkApplyPercent(
        rows.map((r) => ({ id: r.id, name: r.name, avgPrice: r.applyAvgPrice })),
        n,
      );
      let failed = 0;
      for (const u of plan.updates) {
        const res = await fetch(`/api/products/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultCogs: u.defaultCogs }) });
        // A 403/404/500 does not throw — check every response, or the
        // note below would claim success for saves that never landed.
        if (!res.ok) failed++;
      }
      const applied = plan.updates.length - failed;
      const parts: string[] = [];
      if (applied > 0) {
        parts.push(`Applied ${n}% of average price as COGS to ${applied} product${applied === 1 ? "" : "s"}. Old orders keep their stored COGS — this affects new orders and future reports, not history, unless you run a retroactive recalculation.`);
      }
      if (failed > 0) {
        parts.push(`${failed} update${failed === 1 ? "" : "s"} failed — reload and check which rows changed.`);
      }
      if (plan.skipped.length > 0) {
        parts.push(
          `Skipped ${plan.skipped.length} product${plan.skipped.length === 1 ? "" : "s"} with no average price yet (${plan.skipped.map((s) => s.name).join(", ")}): no COGS was written for ${plan.skipped.length === 1 ? "it" : "them"}.`,
        );
      }
      if (parts.length === 0) {
        parts.push("Nothing to apply — no shown products have an average price yet.");
      }
      setNote(parts.join(" "));
      await load();
    } catch { setNote("Bulk apply failed for at least one product — reload and check which rows changed."); }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={3} />
        <TableSkeleton rows={8} />
      </div>
    );
  }
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p role="alert" className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">COGS Hub</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Every product and variant cost in one place. New costs apply to new orders; old orders keep their stored cost, so history never rewrites itself silently.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 ml-auto">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} /> Missing COGS only ({missing})</label>
          <div className="space-y-1"><Label htmlFor="cogs-pct">Apply % of avg price</Label><Input id="cogs-pct" type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="e.g. 40" className="w-28" /></div>
          <Button onClick={applyPercent} disabled={busy || !pct} loading={busy} loadingText="Applying…">Apply to shown</Button>
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>
      {note && <p className="text-sm text-[var(--color-muted-foreground)]">{note}</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Products</CardTitle></CardHeader><CardContent className="text-xl font-bold">{products.length}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Missing COGS</CardTitle></CardHeader><CardContent className="text-xl font-bold">{missing}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">COGS rules</CardTitle></CardHeader><CardContent className="text-xl font-bold">{rules.length}</CardContent></Card>
      </div>
      {rows.length === 0 && (
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">{missingOnly ? "No products are missing COGS." : "No products yet. Sync your store to import products, then set their costs here."}</p>
          <Link href="/dashboard/products" className="text-sm font-medium text-[var(--color-primary)] underline">Go to Products →</Link>
        </CardContent></Card>
      )}
      {rows.length > 0 && (
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-left"><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">SKU</th><th className="px-4 py-3 font-medium">COGS</th><th className="px-4 py-3 font-medium">Avg price</th><th className="px-4 py-3 font-medium">Margin</th><th className="px-4 py-3 font-medium">Source</th><th className="px-4 py-3 font-medium">Last changed</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5">{r.sku ?? "—"}</td>
                  <td className="px-4 py-2.5">{formatMoney(r.cogs, r.cogsCurrency)}</td>
                  <td className="px-4 py-2.5">{formatMoney(r.avgPrice, baseCurrency)}</td>
                  <td className="px-4 py-2.5">{r.margin}%</td>
                  <td className="px-4 py-2.5">{r.source}</td>
                  <td className="px-4 py-2.5">{r.lastChanged ? new Date(r.lastChanged).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
      <p className="text-xs text-[var(--color-muted-foreground)]">How this is calculated: margin at current price = (average selling price − COGS) / average selling price. Average price is total revenue divided by total orders for that product. For per-variant editing and full change history, use the existing Products → COGS editor, which records every change in the rule history.</p>
    </div>
  );
}
