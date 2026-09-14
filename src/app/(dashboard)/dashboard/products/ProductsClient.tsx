"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Edit2, Package, Check, X, Lock,
  Plus, Trash2, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  defaultCogs: number;
  totalRevenue: number;
  totalCogs: number;
  totalProfit: number;
  totalOrders: number;
  avgProfitMargin: number;
  imageUrl?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MarginBadge({ margin }: { margin: number }) {
  if (margin >= 30) return <Badge variant="success">{formatPercent(margin)}</Badge>;
  if (margin >= 15)
    return (
      <Badge variant="outline" className="border-yellow-400 text-yellow-600 dark:text-yellow-400">
        {formatPercent(margin)}
      </Badge>
    );
  return <Badge variant="destructive">{formatPercent(margin)}</Badge>;
}

// ─── Create Product Modal ─────────────────────────────────────────────────────

interface CreateProductModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateProductModal({ onClose, onCreated }: CreateProductModalProps) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [defaultCogs, setDefaultCogs] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Product name is required"); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          sku: sku.trim() || undefined,
          defaultCogs: parseFloat(defaultCogs) || 0,
          currency,
        }),
      });

      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed to create product");
        return;
      }

      onCreated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] shadow-xl w-full max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-product-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 id="create-product-title" className="text-base font-semibold text-[var(--color-foreground)]">
            Add Product
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Product Name <span className="text-red-500">*</span></Label>
            <Input
              id="cp-name"
              placeholder="e.g. Blue Widget Pro"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-sku">SKU <span className="text-[var(--color-muted-foreground)] font-normal text-xs">(optional)</span></Label>
            <Input
              id="cp-sku"
              placeholder="e.g. BWP-001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-cogs">Default COGS ($)</Label>
              <Input
                id="cp-cogs"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={defaultCogs}
                onChange={(e) => setDefaultCogs(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-currency">Currency</Label>
              <Input
                id="cp-currency"
                placeholder="USD"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="uppercase font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 min-w-[100px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {loading ? "Saving…" : "Add Product"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

interface DeleteProductModalProps {
  product: ProductRow;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteProductModal({ product, onClose, onDeleted }: DeleteProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Delete failed");
        return;
      }
      onDeleted();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] shadow-xl w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-product-title"
      >
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <Trash2 className="h-5 w-5 text-red-600" />
            </span>
            <div>
              <h2 id="delete-product-title" className="font-semibold text-[var(--color-foreground)]">
                Delete product?
              </h2>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                <span className="font-medium text-[var(--color-foreground)]">{product.name}</span>
                {product.sku && <span className="font-mono ml-1 text-xs">({product.sku})</span>} will be
                removed. Historical order data is preserved.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading} className="gap-2 min-w-[90px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {loading ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProductsClient({ products: initialProducts }: { products: ProductRow[] }) {
  const { canEditCogs, canWrite } = useRole();
  const { currency } = useCurrency();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cogsVal, setCogsVal] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);

  const canDelete = canWrite;

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Inline COGS editing ──────────────────────────────────────────────────
  const startEdit = (p: ProductRow) => {
    if (!canEditCogs) return;
    setEditingId(p.id);
    setCogsVal(p.defaultCogs.toFixed(2));
  };

  const cancelEdit = () => { setEditingId(null); setCogsVal(""); };

  const saveCogs = async (productId: string) => {
    const cogs = parseFloat(cogsVal);
    if (isNaN(cogs) || cogs < 0) return;
    setSavingId(productId);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCogs: cogs }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, defaultCogs: cogs } : p))
        );
      }
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  // ── Create / Delete callbacks ────────────────────────────────────────────
  const handleCreated = () => {
    setShowCreate(false);
    startTransition(() => router.refresh());
  };

  const handleDeleted = () => {
    if (!deleteTarget) return;
    setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <>
      {/* Modals */}
      {showCreate && (
        <CreateProductModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {deleteTarget && (
        <DeleteProductModal
          product={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Products</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">{products.length} products tracked</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <Input
                className="pl-9 w-56"
                placeholder="Search by name or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canWrite && (
              <Button size="sm" className="gap-2 flex-shrink-0" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Add Product
              </Button>
            )}
          </div>
        </div>

        {/* COGS editing tip */}
        {canEditCogs && products.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-2.5 text-xs text-[var(--color-muted-foreground)]">
            <Edit2 className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-primary)]" />
            Click any COGS value to edit it inline. Changes update profit margins immediately.
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                <tr>
                  {["Product", "SKU", "COGS", "Revenue", "Net Profit", "Margin", "Orders", ...(canDelete ? [""] : [])].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap"
                      >
                        {h === "COGS" && !canEditCogs ? (
                          <>
                            COGS <Lock className="inline h-3 w-3 ml-1 opacity-50" />
                          </>
                        ) : (
                          h
                        )}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canDelete ? 8 : 7} className="px-4 py-16 text-center text-[var(--color-muted-foreground)]">
                      <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium text-[var(--color-foreground)]">No products found</p>
                      <p className="text-xs mt-1">
                        {canWrite
                          ? 'Click "Add Product" to create one, or import orders to start tracking margins.'
                          : "Import orders or connect a store to start tracking product margins."}
                      </p>
                    </td>
                  </tr>
                )}
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--color-muted)]/40 transition-colors group">
                    {/* Product name + image */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-[var(--color-muted)] flex items-center justify-center flex-shrink-0">
                            <Package className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                          </div>
                        )}
                        <span className="font-medium text-[var(--color-foreground)] line-clamp-1">{p.name}</span>
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)] font-mono text-xs">
                      {p.sku ?? "—"}
                    </td>

                    {/* COGS */}
                    <td className="px-4 py-3">
                      {canEditCogs ? (
                        editingId === p.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-7 w-24 text-xs"
                              value={cogsVal}
                              onChange={(e) => setCogsVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveCogs(p.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => saveCogs(p.id)}
                              disabled={savingId === p.id}
                              title="Save"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={cancelEdit}
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(p)}
                            className="flex items-center gap-1.5 text-[var(--color-foreground)] hover:text-[var(--color-primary)] group/cogs"
                            title="Click to edit COGS"
                          >
                            <span>{formatCurrency(p.defaultCogs, currency)}</span>
                            <Edit2 className="h-3 w-3 opacity-0 group-hover/cogs:opacity-60 transition-opacity" />
                          </button>
                        )
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 text-[var(--color-foreground)] cursor-not-allowed"
                          title="Read-only"
                        >
                          {formatCurrency(p.defaultCogs, currency)}
                          <Lock className="h-3 w-3 text-[var(--color-muted-foreground)] opacity-40" />
                        </span>
                      )}
                    </td>

                    {/* Revenue */}
                    <td className="px-4 py-3 text-[var(--color-foreground)]">
                      {formatCurrency(p.totalRevenue, currency)}
                    </td>

                    {/* Net Profit */}
                    <td
                      className={cn(
                        "px-4 py-3 font-semibold",
                        p.totalProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500"
                      )}
                    >
                      {formatCurrency(p.totalProfit, currency)}
                    </td>

                    {/* Margin */}
                    <td className="px-4 py-3">
                      <MarginBadge margin={p.avgProfitMargin} />
                    </td>

                    {/* Orders */}
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {p.totalOrders.toLocaleString()}
                    </td>

                    {/* Delete (owner/admin only) */}
                    {canDelete && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDeleteTarget(p)}
                          title="Delete product"
                          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-500 transition-opacity"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary footer */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)] px-1">
            <span>
              {filtered.length} of {products.length} products shown
            </span>
            <span>
              Total revenue:{" "}
              <span className="font-medium text-[var(--color-foreground)]">
                {formatCurrency(
                  filtered.reduce((s, p) => s + p.totalRevenue, 0),
                  currency
                )}
              </span>
              {" · "}
              Total profit:{" "}
              <span
                className={cn(
                  "font-medium",
                  filtered.reduce((s, p) => s + p.totalProfit, 0) >= 0
                    ? "text-[var(--color-primary)]"
                    : "text-red-500"
                )}
              >
                {formatCurrency(
                  filtered.reduce((s, p) => s + p.totalProfit, 0),
                  currency
                )}
              </span>
            </span>
          </div>
        )}
      </div>
    </>
  );
}

