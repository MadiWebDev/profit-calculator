"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, Package, Loader2, Edit2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

interface BundleComponent { productId: string; name: string; cogs: number; quantity: number }
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
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<BundleForm>({
    defaultValues: { name: "", sku: "", sellingPrice: 0, components: [{ productId: "", name: "", cogs: 0, quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "components" });
  const watched = watch();

  const computedCogs = watched.components.reduce((s, c) => s + (Number(c.cogs) || 0) * (Number(c.quantity) || 1), 0);
  const computedMargin = watched.sellingPrice > 0 ? ((watched.sellingPrice - computedCogs) / watched.sellingPrice) * 100 : 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bundles");
      const j = await res.json();
      setBundles(j.bundles?.map((b: { _id: string } & Omit<BundleRow, "id">) => ({ ...b, id: b._id })) ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async (data: BundleForm) => {
    setSaving(true); setError(null);
    try {
      const url = "/api/bundles";
      const body = editId ? { ...data, id: editId } : data;
      const method = editId ? "PATCH" : "POST";      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Save failed"); return; }
      reset(); setShowForm(false); setEditId(null); await load();
    } finally { setSaving(false); }
  };

  const deleteBundle = async (id: string) => {
    if (!confirm("Delete this bundle?")) return;
    await fetch(`/api/bundles?id=${id}`, { method: "DELETE" });
    await load();
  };

  const editBundle = (b: BundleRow) => {
    reset({ name: b.name, sku: b.sku ?? "", sellingPrice: b.sellingPrice, components: b.components });
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
        <Button onClick={() => { setShowForm(!showForm); setEditId(null); reset(); }} className="gap-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Bundle Name</Label>
                  <Input placeholder="e.g. Starter Kit (3-piece)" {...register("name", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label>SKU (optional)</Label>
                  <Input placeholder="BUNDLE-001" {...register("sku")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Selling Price</Label>
                  <div className="relative">
                    <Input type="number" step="0.01" min="0" {...register("sellingPrice", { valueAsNumber: true })} />
                  </div>
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
                        <Input placeholder="Product name" className="h-8 text-sm" {...register(`components.${i}.name`, { required: true })} />
                      </div>
                      <div className="col-span-3 space-y-1">
                        {i === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">COGS / unit</p>}
                        <div className="relative">
                          <Input type="number" step="0.01" min="0" className="h-8 text-sm" {...register(`components.${i}.cogs`, { valueAsNumber: true })} />
                        </div>
                      </div>
                      <div className="col-span-2 space-y-1">
                        {i === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">Qty</p>}
                        <Input type="number" min="1" className="h-8 text-sm text-center" {...register(`components.${i}.quantity`, { valueAsNumber: true })} />
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
              </div>

              {/* Live preview */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-accent)] border border-[var(--color-border)]">
                <div className="space-y-0.5">
                  <p className="text-xs text-[var(--color-muted-foreground)]">Total COGS</p>
                  <p className="font-semibold text-[var(--color-foreground)]">{formatCurrency(computedCogs)}</p>
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
                    {formatCurrency((watched.sellingPrice ?? 0) - computedCogs)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editId ? "Save Changes" : "Create Bundle"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditId(null); reset(); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Bundles list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-[var(--color-muted)] animate-pulse" />)}</div>
      ) : bundles.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-muted-foreground)]">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium mb-1">No bundles defined yet</p>
          <p className="text-sm mb-4">Define bundles to instantly see their margin across all components.</p>
          <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Create First Bundle</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {bundles.map((b) => (
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
                      <span>Sell: <strong className="text-[var(--color-foreground)]">{formatCurrency(b.sellingPrice, b.currency)}</strong></span>
                      <span>COGS: <strong className="text-[var(--color-foreground)]">{formatCurrency(b.totalCogs, b.currency)}</strong></span>
                      <span>Profit: <strong className={cn(b.sellingPrice - b.totalCogs >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                        {formatCurrency(b.sellingPrice - b.totalCogs, b.currency)}
                      </strong></span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {b.components.map((c, i) => (
                        <span key={i} className="text-xs bg-[var(--color-muted)] px-2 py-0.5 rounded-full text-[var(--color-muted-foreground)]">
                          {c.quantity > 1 ? `${c.quantity}× ` : ""}{c.name} ({formatCurrency(c.cogs * c.quantity, b.currency)})
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => editBundle(b)} className="h-8 gap-1.5 text-xs">
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteBundle(b.id)} className="h-8 text-red-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
