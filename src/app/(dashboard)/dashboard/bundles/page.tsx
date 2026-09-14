"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, Package, Loader2, Edit2, AlertCircle, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

interface BundleComponent { productId?: string; name: string; cogs: number; quantity: number }
interface BundleRow {
  id: string; name: string; sku?: string; sellingPrice: number;
  totalCogs: number; grossMargin: number; netMarginEstimate: number;
  components: BundleComponent[]; currency: string;
}
interface BundleForm {
  name: string; sku: string; sellingPrice: number;
  components: BundleComponent[];
}

function marginColor(m: number) {
  if (m >= 30) return "success";
  if (m >= 15) return "warning";
  return "destructive";
}

export default function BundlesPage() {
  const { currency } = useCurrency();
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<BundleForm>({
    defaultValues: { name: "", sku: "", sellingPrice: 0, components: [{ productId: "", name: "", cogs: 0, quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "components" });
  const watched = watch();

  const componentsForPreview = watched.components.map((c) => ({
    cogs: Number.isFinite(Number(c.cogs)) ? Number(c.cogs) : 0,
    quantity: Number.isFinite(Number(c.quantity)) && Number(c.quantity) > 0 ? Number(c.quantity) : 1,
  }));
  const previewSellingPrice = Number.isFinite(Number(watched.sellingPrice)) ? Number(watched.sellingPrice) : 0;
  const computedCogs = componentsForPreview.reduce((s, c) => s + c.cogs * c.quantity, 0);
  const computedMargin = previewSellingPrice > 0 ? ((previewSellingPrice - computedCogs) / previewSellingPrice) * 100 : 0;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/bundles");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(j.error ?? "Failed to load bundles");
        setBundles([]);
        return;
      }
      setBundles(j.bundles?.map((b: { _id: string } & Omit<BundleRow, "id">) => ({ ...b, id: b._id })) ?? []);
    } catch {
      setLoadError("Could not reach the server. Check your connection and try again.");
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async (data: BundleForm) => {
    setSaving(true); setError(null);
    try {
      // Numeric RHF fields become NaN when a user clears the input; catch that
      // before it ever reaches the network so the error is actionable.
      if (!Number.isFinite(data.sellingPrice) || data.sellingPrice < 0) {
        setError("Selling price must be a valid number, 0 or greater.");
        return;
      }
      const badComponent = data.components.find(
        (c) => !Number.isFinite(Number(c.cogs)) || Number(c.cogs) < 0 || !Number.isFinite(Number(c.quantity)) || Number(c.quantity) <= 0
      );
      if (badComponent) {
        setError("Every component needs a valid COGS (0 or greater) and quantity (at least 1).");
        return;
      }

      const cleanedComponents = data.components.map((c) => ({
        ...c,
        productId: c.productId?.trim() || undefined,
        name: c.name.trim(),
        cogs: Number(c.cogs),
        quantity: Number(c.quantity),
      }));

      const url = "/api/bundles";
      const body = editId
        ? { ...data, components: cleanedComponents, id: editId }
        : { ...data, components: cleanedComponents };
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Save failed"); return; }
      reset(); setShowForm(false); setEditId(null); await load();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally { setSaving(false); }
  };

  const deleteBundle = async (id: string) => {
    if (!confirm("Delete this bundle?")) return;
    setDeletingId(id);
    setLoadError(null);
    try {
      const res = await fetch(`/api/bundles?id=${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(j.error ?? "Failed to delete bundle");
        return;
      }
      await load();
    } catch {
      setLoadError("Could not reach the server. Check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const editBundle = (b: BundleRow) => {
    reset({ name: b.name, sku: b.sku ?? "", sellingPrice: b.sellingPrice, components: b.components });
    setError(null);
    setEditId(b.id); setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Bundle Profit Tracker</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">Define product bundles and instantly see their true margin.</p>
          </div>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditId(null); setError(null); reset(); }} className="gap-2">
          <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "New Bundle"}
        </Button>
      </div>

      {/* Create / edit form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editId ? "Edit Bundle" : "Create Bundle"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
                </div>
              )}

              {/* ── Example hint ── */}
              <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExample((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--color-muted)] hover:bg-[var(--color-border)] transition-colors text-sm"
                >
                  <span className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
                    <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
                    See an example bundle
                  </span>
                  {showExample ? <ChevronUp className="h-4 w-4 text-[var(--color-muted-foreground)]" /> : <ChevronDown className="h-4 w-4 text-[var(--color-muted-foreground)]" />}
                </button>
                {showExample && (
                  <div className="px-4 py-3 bg-[var(--color-card)] space-y-3 text-sm">
                    <p className="text-[var(--color-muted-foreground)]">
                      A <strong className="text-[var(--color-foreground)]">Skincare Starter Kit</strong> sells for{" "}
                      <strong className="text-[var(--color-foreground)]">$49.99</strong> and contains three products:
                    </p>
                    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-[var(--color-muted)]">
                          <tr>
                            {["Component", "COGS / unit", "Qty", "Line COGS"].map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {[
                            { name: "Facial Cleanser (50ml)", cogs: 4.20, qty: 1 },
                            { name: "Moisturiser (30ml)",     cogs: 6.80, qty: 1 },
                            { name: "Lip Balm",               cogs: 1.50, qty: 2 },
                          ].map((row) => (
                            <tr key={row.name} className="hover:bg-[var(--color-muted)]/50">
                              <td className="px-3 py-2 text-[var(--color-foreground)]">{row.name}</td>
                              <td className="px-3 py-2 text-[var(--color-muted-foreground)]">${row.cogs.toFixed(2)}</td>
                              <td className="px-3 py-2 text-[var(--color-muted-foreground)]">{row.qty}</td>
                              <td className="px-3 py-2 font-medium text-[var(--color-foreground)]">${(row.cogs * row.qty).toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr className="bg-[var(--color-muted)]/60 font-semibold">
                            <td className="px-3 py-2 text-[var(--color-foreground)]" colSpan={3}>Total COGS</td>
                            <td className="px-3 py-2 text-[var(--color-foreground)]">$14.00</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <span className="text-[var(--color-muted-foreground)]">Selling price: <strong className="text-[var(--color-foreground)]">$49.99</strong></span>
                      <span className="text-[var(--color-muted-foreground)]">Gross profit: <strong className="text-green-600 dark:text-green-400">$35.99</strong></span>
                      <span className="text-[var(--color-muted-foreground)]">Gross margin: <strong className="text-green-600 dark:text-green-400">72.0%</strong></span>
                    </div>
                    <p className="text-xs text-[var(--color-muted-foreground)] italic">
                      Try entering these values above — the live preview will update as you type.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bundle-name">Bundle Name</Label>
                  <Input
                    id="bundle-name"
                    placeholder="e.g. Starter Kit (3-piece)"
                    aria-invalid={!!errors.name}
                    {...register("name", { required: "Bundle name is required", validate: (v) => v.trim().length > 0 || "Bundle name is required" })}
                  />
                  {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bundle-sku">SKU (optional)</Label>
                  <Input id="bundle-sku" placeholder="BUNDLE-001" {...register("sku")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bundle-price">Selling Price</Label>
                  <Input
                    id="bundle-price"
                    type="number"
                    step="0.01"
                    min="0"
                    aria-invalid={!!errors.sellingPrice}
                    {...register("sellingPrice", {
                      valueAsNumber: true,
                      required: "Selling price is required",
                      min: { value: 0, message: "Must be 0 or greater" },
                    })}
                  />
                  {errors.sellingPrice && <p className="text-xs text-red-600">{errors.sellingPrice.message}</p>}
                </div>
              </div>

              {/* Components */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Bundle Components</Label>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => append({ productId: "", name: "", cogs: 0, quantity: 1 })}>
                    <Plus className="h-3.5 w-3.5" /> Add Component
                  </Button>
                </div>
                <div className="space-y-2">
                  {fields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5 space-y-1">
                        {i === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">Product Name</p>}
                        <Input
                          placeholder="Product name"
                          className="h-8 text-sm"
                          aria-invalid={!!errors.components?.[i]?.name}
                          {...register(`components.${i}.name`, { required: true, validate: (v) => v.trim().length > 0 })}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        {i === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">COGS / unit</p>}
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8 text-sm"
                          aria-invalid={!!errors.components?.[i]?.cogs}
                          {...register(`components.${i}.cogs`, { valueAsNumber: true, required: true, min: 0 })}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        {i === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">Qty</p>}
                        <Input
                          type="number"
                          min="1"
                          className="h-8 text-sm text-center"
                          aria-invalid={!!errors.components?.[i]?.quantity}
                          {...register(`components.${i}.quantity`, { valueAsNumber: true, required: true, min: 1 })}
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end">
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400"
                          onClick={() => fields.length > 1 && remove(i)} disabled={fields.length === 1}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {(errors.components?.root || errors.components) && Array.isArray(errors.components) && (
                  <p className="text-xs text-red-600">Every component needs a name, COGS ≥ 0, and quantity ≥ 1.</p>
                )}
              </div>

              {/* Live preview */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-accent)] border border-[var(--color-border)]">
                <div className="space-y-0.5">
                  <p className="text-xs text-[var(--color-muted-foreground)]">Total COGS</p>
                  <p className="font-semibold text-[var(--color-foreground)]">{formatCurrency(computedCogs, currency)}</p>
                </div>
                <div className="space-y-0.5 text-right">
                  <p className="text-xs text-[var(--color-muted-foreground)]">Gross Margin</p>
                  <p className={cn("text-xl font-bold", computedMargin >= 20 ? "text-[var(--color-primary)]" : "text-red-500")}>
                    {formatPercent(computedMargin)}
                  </p>
                </div>
                <div className="space-y-0.5 text-right">
                  <p className="text-xs text-[var(--color-muted-foreground)]">Gross Profit / Bundle</p>
                  <p className="font-semibold text-[var(--color-foreground)]">
                    {formatCurrency(previewSellingPrice - computedCogs, currency)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editId ? "Save Changes" : "Create Bundle"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditId(null); setError(null); reset(); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{loadError}
        </div>
      )}

      {/* Bundles list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-[var(--color-muted)] animate-pulse" />)}</div>
      ) : bundles.length === 0 ? (
        <div className="space-y-6">
          {/* Empty state CTA */}
          <div className="text-center py-12 text-[var(--color-muted-foreground)]">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium mb-1">No bundles defined yet</p>
            <p className="text-sm mb-4">Define bundles to instantly see their margin across all components.</p>
            <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Create First Bundle</Button>
          </div>

          {/* Example bundle card */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Lightbulb className="h-4 w-4 text-yellow-500 flex-shrink-0" />
              <p className="text-sm font-medium text-[var(--color-foreground)]">Example — what a bundle looks like</p>
            </div>
            <Card className="border-dashed opacity-80">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-[var(--color-foreground)]">Skincare Starter Kit</p>
                      <span className="text-xs font-mono text-[var(--color-muted-foreground)]">(SKIN-KIT-01)</span>
                      <Badge variant="success">72.00% margin</Badge>
                    </div>
                    {/* Metrics */}
                    <div className="flex flex-wrap gap-3 text-sm text-[var(--color-muted-foreground)]">
                      <span>Sell: <strong className="text-[var(--color-foreground)]">$49.99</strong></span>
                      <span>COGS: <strong className="text-[var(--color-foreground)]">$14.00</strong></span>
                      <span>Profit: <strong className="text-[var(--color-primary)]">$35.99</strong></span>
                    </div>
                    {/* Component pills */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        { name: "Facial Cleanser (50ml)", lineCogs: 4.20 },
                        { name: "Moisturiser (30ml)",     lineCogs: 6.80 },
                        { name: "2× Lip Balm",            lineCogs: 3.00 },
                      ].map((c) => (
                        <span key={c.name} className="text-xs bg-[var(--color-muted)] px-2 py-0.5 rounded-full text-[var(--color-muted-foreground)]">
                          {c.name} (${c.lineCogs.toFixed(2)})
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Ghost action buttons — non-functional, illustrative */}
                  <div className="flex items-center gap-2 flex-shrink-0 opacity-40 pointer-events-none select-none">
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {/* Example callout label */}
                <p className="mt-3 text-[10px] uppercase tracking-wider font-semibold text-[var(--color-muted-foreground)] border-t border-dashed border-[var(--color-border)] pt-2">
                  ↑ This is what your bundles will look like — click &quot;Create First Bundle&quot; to add a real one.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {bundles.map((b) => {
            const bundleCurrency = b.currency || currency;
            return (
              <Card key={b.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-[var(--color-foreground)]">{b.name}</p>
                        {b.sku && <span className="text-xs font-mono text-[var(--color-muted-foreground)]">({b.sku})</span>}
                        <Badge variant={marginColor(b.grossMargin) as "success" | "warning" | "destructive"}>{formatPercent(b.grossMargin)} margin</Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-[var(--color-muted-foreground)]">
                        <span>Sell: <strong className="text-[var(--color-foreground)]">{formatCurrency(b.sellingPrice, bundleCurrency)}</strong></span>
                        <span>COGS: <strong className="text-[var(--color-foreground)]">{formatCurrency(b.totalCogs, bundleCurrency)}</strong></span>
                        <span>Profit: <strong className={cn(b.sellingPrice - b.totalCogs >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                          {formatCurrency(b.sellingPrice - b.totalCogs, bundleCurrency)}
                        </strong></span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {b.components.map((c, i) => (
                          <span key={i} className="text-xs bg-[var(--color-muted)] px-2 py-0.5 rounded-full text-[var(--color-muted-foreground)]">
                            {c.quantity > 1 ? `${c.quantity}× ` : ""}{c.name} ({formatCurrency(c.cogs * c.quantity, bundleCurrency)})
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => editBundle(b)} className="h-8 gap-1.5 text-xs" disabled={deletingId === b.id}>
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteBundle(b.id)}
                        className="h-8 text-red-400 hover:text-red-600"
                        disabled={deletingId === b.id}
                      >
                        {deletingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}