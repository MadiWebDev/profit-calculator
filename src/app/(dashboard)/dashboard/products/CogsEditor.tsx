"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, ChevronDown, ChevronUp, History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, cn } from "@/lib/utils";

interface CogsFormValues {
  supplierCost: number;
  shippingToWarehouse: number;
  importDuties: number;
  packagingCost: number;
  prepCost: number;
  otherLandedCost: number;
  note: string;
}

interface CogsHistoryItem {
  cogs: number;
  effectiveFrom: string;
  note?: string;
}

interface CogsEditorProps {
  productId: string;
  variantId?: string;
  productName: string;
  variantTitle?: string;
  sku?: string;
  storeId: string;
  currentCogs: number;
  history?: CogsHistoryItem[];
  currency?: string;
  onSaved?: (newCogs: number) => void;
}

const LANDED_FIELDS: { key: keyof CogsFormValues; label: string; help: string }[] = [
  { key: "supplierCost",        label: "Supplier / Product Cost",  help: "What you pay the supplier per unit" },
  { key: "shippingToWarehouse", label: "Inbound Shipping",         help: "Cost to ship from supplier to you or 3PL" },
  { key: "importDuties",        label: "Import Duties & Taxes",    help: "Customs, tariffs, VAT on import" },
  { key: "packagingCost",       label: "Packaging",                help: "Boxes, inserts, tissue, etc." },
  { key: "prepCost",            label: "Prep / 3PL Handling",      help: "Prep center or 3PL per-unit fee" },
  { key: "otherLandedCost",     label: "Other Landed Costs",       help: "Any other per-unit costs" },
];

export function CogsEditor({
  productId, variantId, productName, variantTitle, sku, storeId,
  currentCogs, history = [], currency = "USD", onSaved,
}: CogsEditorProps) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, watch } = useForm<CogsFormValues>({
    defaultValues: {
      supplierCost: currentCogs,
      shippingToWarehouse: 0,
      importDuties: 0,
      packagingCost: 0,
      prepCost: 0,
      otherLandedCost: 0,
      note: "",
    },
  });

  const watched = watch();
  const computedCogs = LANDED_FIELDS.reduce((s, f) => s + (Number(watched[f.key]) || 0), 0);

  const onSubmit = async (data: CogsFormValues) => {
    setLoading(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/cogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, productId, variantId, productName, variantTitle, sku, storeId, currency }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Save failed"); return; }
      const j = await res.json();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSaved?.(j.cogs);
    } finally { setLoading(false); }
  };

  return (
    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-muted)] hover:bg-[var(--color-border)] transition-colors text-sm"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--color-foreground)]">{productName}</span>
          {variantTitle && <span className="text-[var(--color-muted-foreground)]">— {variantTitle}</span>}
          {sku && <span className="text-xs text-[var(--color-muted-foreground)] font-mono">({sku})</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("font-semibold", currentCogs > 0 ? "text-[var(--color-foreground)]" : "text-yellow-600")}>
            {currentCogs > 0 ? formatCurrency(currentCogs, currency) : "No COGS set"}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="p-4 bg-[var(--color-card)] space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          {success && (
            <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950 border border-green-200 rounded-lg px-3 py-2">
              ✓ COGS updated to {formatCurrency(computedCogs, currency)}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Break down your landed cost for maximum accuracy. Total COGS = sum of all fields below.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {LANDED_FIELDS.map(({ key, label, help }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`${productId}-${key}`} className="text-xs" title={help}>{label}</Label>
                  <div className="relative">
                    <Input
                      id={`${productId}-${key}`}
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 text-sm"
                      {...register(key, { valueAsNumber: true })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between py-2 px-3 bg-[var(--color-accent)] rounded-lg">
              <span className="text-sm font-medium text-[var(--color-foreground)]">Total COGS</span>
              <span className="text-lg font-bold text-[var(--color-primary)]">{formatCurrency(computedCogs, currency)}</span>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${productId}-note`} className="text-xs">Change Note (optional)</Label>
              <Input id={`${productId}-note`} placeholder="e.g. Supplier raised price Aug 2026" className="h-8 text-sm" {...register("note")} />
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save COGS
              </Button>
              {history.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowHistory(!showHistory)} className="gap-1.5 text-xs">
                  <History className="h-3.5 w-3.5" />
                  History ({history.length})
                </Button>
              )}
            </div>
          </form>

          {showHistory && history.length > 0 && (
            <div className="border-t border-[var(--color-border)] pt-3 space-y-1.5">
              <p className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">COGS History</p>
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)] py-1.5 px-2 rounded hover:bg-[var(--color-muted)]">
                  <span>{new Date(h.effectiveFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  <span className="font-medium text-[var(--color-foreground)]">{formatCurrency(h.cogs, currency)}</span>
                  {h.note && <span className="truncate max-w-[200px] italic">{h.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
