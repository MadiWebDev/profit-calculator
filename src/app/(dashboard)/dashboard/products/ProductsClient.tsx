"use client";

import { useState } from "react";
import { Search, Edit2, Package, Check, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import { ViewerBanner } from "@/components/dashboard/RoleGate";

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

function MarginBadge({ margin }: { margin: number }) {
  if (margin >= 30) return <Badge variant="success">{formatPercent(margin)}</Badge>;
  if (margin >= 15) return (
    <Badge variant="outline" className="border-yellow-400 text-yellow-600 dark:text-yellow-400">
      {formatPercent(margin)}
    </Badge>
  );
  return <Badge variant="destructive">{formatPercent(margin)}</Badge>;
}

export function ProductsClient({ products }: { products: ProductRow[] }) {
  const { canEditCogs } = useRole();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cogsVal, setCogsVal] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
  );

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
      await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCogs: cogs }),
      });
      setEditingId(null);
      // Refresh data without full reload for smoother UX
      window.location.reload();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Products</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{products.length} products tracked</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
          <Input
            className="pl-9 w-64"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Read-only notice for viewers */}
      {!canEditCogs && (
        <ViewerBanner message="You have read-only access. COGS editing is restricted to members, admins, and owners." />
      )}

      {/* COGS editing tip for editable roles */}
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
                {["Product", "SKU", "COGS", "Revenue", "Net Profit", "Margin", "Orders"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap"
                  >
                    {h}
                    {h === "COGS" && !canEditCogs && (
                      <Lock className="inline h-3 w-3 ml-1 opacity-50" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-[var(--color-muted-foreground)]">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium text-[var(--color-foreground)]">No products found</p>
                    <p className="text-xs mt-1">Import orders or connect a store to start tracking product margins.</p>
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--color-muted)]/40 transition-colors">
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

                  {/* COGS — editable or locked */}
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
                          className="flex items-center gap-1.5 text-[var(--color-foreground)] hover:text-[var(--color-primary)] group"
                          title="Click to edit COGS"
                        >
                          <span>{formatCurrency(p.defaultCogs)}</span>
                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      )
                    ) : (
                      /* Locked — viewer */
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-foreground)] cursor-not-allowed" title="Read-only">
                        {formatCurrency(p.defaultCogs)}
                        <Lock className="h-3 w-3 text-[var(--color-muted-foreground)] opacity-40" />
                      </span>
                    )}
                  </td>

                  {/* Revenue */}
                  <td className="px-4 py-3 text-[var(--color-foreground)]">
                    {formatCurrency(p.totalRevenue)}
                  </td>

                  {/* Net Profit */}
                  <td className={cn("px-4 py-3 font-semibold", p.totalProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                    {formatCurrency(p.totalProfit)}
                  </td>

                  {/* Margin badge */}
                  <td className="px-4 py-3">
                    <MarginBadge margin={p.avgProfitMargin} />
                  </td>

                  {/* Orders */}
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {p.totalOrders.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)] px-1">
          <span>{filtered.length} of {products.length} products shown</span>
          <span>
            Total revenue:{" "}
            <span className="font-medium text-[var(--color-foreground)]">
              {formatCurrency(filtered.reduce((s, p) => s + p.totalRevenue, 0))}
            </span>
            {" · "}
            Total profit:{" "}
            <span className={cn("font-medium", filtered.reduce((s, p) => s + p.totalProfit, 0) >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
              {formatCurrency(filtered.reduce((s, p) => s + p.totalProfit, 0))}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
