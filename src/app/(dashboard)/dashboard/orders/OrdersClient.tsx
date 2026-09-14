"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, ChevronLeft, ChevronRight, Download,
  Plus, Trash2, Pencil, X, Loader2, AlertTriangle, Upload,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";
import { useRole } from "@/components/dashboard/RoleContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  externalId: string;
  orderNumber?: string;
  orderDate: string;
  status: string;
  grossRevenue: number;
  netRevenue: number;
  totalCogs: number;
  netProfit: number;
  profitMargin: number;
  adSpendAllocated: number;
  refundAmount: number;
  customerEmail?: string;
  itemCount: number;
}

interface OrdersData {
  orders: OrderRow[];
  total: number;
  pages: number;
  page: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["fulfilled", "pending", "refunded", "cancelled"] as const;
type OrderStatus = (typeof STATUS_OPTIONS)[number];

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    fulfilled: "success",
    pending: "outline",
    refunded: "warning",
    cancelled: "destructive",
  };
  return (
    <Badge
      variant={(map[status] ?? "outline") as "success" | "outline" | "warning" | "destructive"}
      className="capitalize text-xs"
    >
      {status}
    </Badge>
  );
};

// ─── Order Form (shared by Create and Edit) ───────────────────────────────────

interface OrderFormState {
  orderNumber: string;
  orderDate: string;
  status: OrderStatus;
  customerEmail: string;
  grossRevenue: string;
  discounts: string;
  totalCogs: string;
  shippingCost: string;
  transactionFees: string;
  taxes: string;
  refundAmount: string;
  adSpendAllocated: string;
}

const EMPTY_FORM: OrderFormState = {
  orderNumber: "",
  orderDate: new Date().toISOString().slice(0, 10),
  status: "fulfilled",
  customerEmail: "",
  grossRevenue: "",
  discounts: "0",
  totalCogs: "0",
  shippingCost: "0",
  transactionFees: "0",
  taxes: "0",
  refundAmount: "0",
  adSpendAllocated: "0",
};

function orderRowToForm(o: OrderRow): OrderFormState {
  return {
    orderNumber: o.orderNumber ?? o.externalId,
    orderDate: o.orderDate.slice(0, 10),
    status: (STATUS_OPTIONS.includes(o.status as OrderStatus) ? o.status : "fulfilled") as OrderStatus,
    customerEmail: o.customerEmail ?? "",
    grossRevenue: o.grossRevenue.toFixed(2),
    discounts: "0",
    totalCogs: o.totalCogs.toFixed(2),
    shippingCost: "0",
    transactionFees: "0",
    taxes: "0",
    refundAmount: o.refundAmount.toFixed(2),
    adSpendAllocated: o.adSpendAllocated.toFixed(2),
  };
}

function n(v: string) {
  const num = parseFloat(v);
  return isNaN(num) || num < 0 ? 0 : num;
}

interface OrderFormProps {
  title: string;
  initialValues?: OrderFormState;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (form: OrderFormState) => Promise<void>;
  loading: boolean;
  error: string | null;
}

function OrderFormModal({
  title, initialValues = EMPTY_FORM, submitLabel,
  onClose, onSubmit, loading, error,
}: OrderFormProps) {
  const [form, setForm] = useState<OrderFormState>(initialValues);
  const { currency, symbol } = useCurrency();

  const set = (key: keyof OrderFormState, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  // Estimated net profit preview (client-side, mirrors calcOrderProfit)
  const grossRev   = n(form.grossRevenue);
  const discounts  = n(form.discounts);
  const cogs       = n(form.totalCogs);
  const shipping   = n(form.shippingCost);
  const fees       = n(form.transactionFees);
  const refund     = n(form.refundAmount);
  const adSpend    = n(form.adSpendAllocated);
  const netRevPreview = grossRev - discounts - refund;
  const netProfitPreview = netRevPreview - cogs - shipping - fees - adSpend;

  const MONETARY_FIELDS: { key: keyof OrderFormState; label: string }[] = [
    { key: "grossRevenue",    label: "Gross Revenue *" },
    { key: "discounts",       label: "Discounts" },
    { key: "totalCogs",       label: "Total COGS" },
    { key: "shippingCost",    label: "Shipping Cost" },
    { key: "transactionFees", label: "Transaction Fees" },
    { key: "taxes",           label: "Taxes" },
    { key: "refundAmount",    label: "Refund Amount" },
    { key: "adSpendAllocated",label: "Ad Spend Allocated" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div
        className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] shadow-xl w-full max-w-lg my-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 id="order-modal-title" className="text-base font-semibold text-[var(--color-foreground)]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
            aria-label="Close"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="of-num">Order Number</Label>
              <Input
                id="of-num"
                placeholder="e.g. 1001"
                value={form.orderNumber}
                onChange={(e) => set("orderNumber", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-date">Order Date <span className="text-red-500">*</span></Label>
              <Input
                id="of-date"
                type="date"
                required
                value={form.orderDate}
                onChange={(e) => set("orderDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="of-status">Status</Label>
              <select
                id="of-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] capitalize"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-email">Customer Email</Label>
              <Input
                id="of-email"
                type="email"
                placeholder="customer@example.com"
                value={form.customerEmail}
                onChange={(e) => set("customerEmail", e.target.value)}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--color-border)]" />

          {/* Monetary fields */}
          <div className="grid grid-cols-2 gap-3">
            {MONETARY_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`of-${key}`} className="text-xs">
                  {label}
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)] select-none">
                    {symbol}
                  </span>
                  <Input
                    id={`of-${key}`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    required={key === "grossRevenue"}
                    className="text-sm pl-7"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Live net profit preview */}
          <div
            className={cn(
              "flex items-center justify-between rounded-lg px-4 py-3 text-sm",
              netProfitPreview >= 0
                ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
            )}
          >
            <span className="text-[var(--color-muted-foreground)]">Estimated Net Profit</span>
            <span
              className={cn(
                "font-bold text-base",
                netProfitPreview >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600"
              )}
            >
              {formatCurrency(netProfitPreview, currency)}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 min-w-[110px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

interface DeleteOrderModalProps {
  order: OrderRow;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteOrderModal({ order, onClose, onDeleted }: DeleteOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
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
        aria-labelledby="delete-order-title"
      >
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <Trash2 className="h-5 w-5 text-red-600" />
            </span>
            <div>
              <h2 id="delete-order-title" className="font-semibold text-[var(--color-foreground)]">
                Delete order?
              </h2>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                Order{" "}
                <span className="font-medium text-[var(--color-foreground)]">
                  #{order.orderNumber ?? order.externalId}
                </span>{" "}
                will be permanently removed. This cannot be undone.
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

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

const CSV_TEMPLATE_HEADERS = [
  "order_id", "order_date", "order_number", "customer_email",
  "gross_revenue", "discounts", "shipping_revenue", "shipping_cost",
  "cogs", "transaction_fees", "taxes", "refund_amount",
  "ad_spend_allocated", "status",
].join(",");

interface CsvImportModalProps {
  onClose: () => void;
  onImported: (imported: number) => void;
}

function CsvImportModal({ onClose, onImported }: CsvImportModalProps) {
  const [storeName, setStoreName]   = useState("CSV Import");
  const [file, setFile]             = useState<File | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [result, setResult]         = useState<{ imported: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    // Use today's date so imported orders fall in the current period
    const today = new Date();
    const pad   = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const exampleRow = [
      "1001", todayStr, "#1001", "customer@example.com",
      "49.99", "0", "0", "4.50",
      "12.00", "1.75", "0", "0",
      "8.00", "fulfilled",
    ].join(",");
    const csv  = [CSV_TEMPLATE_HEADERS, exampleRow].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "profitcalc-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file)             { setError("Select a CSV file first.");      return; }
    if (!storeName.trim()) { setError("Enter a store name.");           return; }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file",      file);
      fd.append("storeName", storeName.trim());
      const res  = await fetch("/api/orders/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed. Please try again.");
        return;
      }
      setResult({ imported: json.imported, errors: json.errors });
      onImported(json.imported);
    } catch {
      setError("Network error — please check your connection and retry.");
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
        aria-labelledby="csv-import-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 id="csv-import-title" className="text-base font-semibold text-[var(--color-foreground)]">
            Import Orders via CSV
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Success state */}
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                  <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-[var(--color-foreground)]">Import complete</p>
                  <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                    ✅ {result.imported} orders imported
                    {result.errors > 0 && (
                      <span className="text-yellow-600 dark:text-yellow-400"> · ⚠️ {result.errors} rows skipped</span>
                    )}
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <>
              {/* Template download hint */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-accent)] border border-[var(--color-border)]">
                <Upload className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-[var(--color-foreground)]">CSV Format</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    Use our template to ensure the correct column format.
                  </p>
                  <button
                    onClick={downloadTemplate}
                    className="text-xs text-[var(--color-primary)] hover:underline mt-1"
                    type="button"
                  >
                    ↓ Download CSV template
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Store name */}
              <div className="space-y-1.5">
                <Label htmlFor="ci-store">Store Name</Label>
                <Input
                  id="ci-store"
                  placeholder="My Store (CSV Import)"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>

              {/* File picker */}
              <div className="space-y-1.5">
                <Label htmlFor="ci-file">CSV File</Label>
                <Input
                  id="ci-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="cursor-pointer"
                  onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }}
                />
                {file && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {file.name} — {(file.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={loading || !file} className="flex-1 gap-2">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                    : <><Upload className="h-4 w-4" /> Import</>
                  }
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrdersClient({ data }: { data: OrdersData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currency } = useCurrency();
  const { canWrite } = useRole();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [isPending, startTransition] = useTransition();

  // Local state so optimistic updates work without full reload
  const [orders, setOrders] = useState<OrderRow[]>(data.orders);

  const canDelete = canWrite;

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<OrderRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderRow | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Shared form loading / error state
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── URL-driven search / pagination (unchanged from original) ───────────────
  const goSearch = (q: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (q) p.set("search", q); else p.delete("search");
    p.set("page", "1");
    startTransition(() => router.push(`/dashboard/orders?${p.toString()}`));
  };

  const goPage = (pg: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(pg));
    startTransition(() => router.push(`/dashboard/orders?${p.toString()}`));
  };

  // ── CSV export (current page) ──────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["Order #", "Date", "Status", "Revenue", "COGS", "Net Profit", "Margin %", "Ad Spend", "Refund"];
    const rows = orders.map((o) => [
      o.orderNumber ?? o.externalId,
      new Date(o.orderDate).toLocaleDateString(),
      o.status,
      o.grossRevenue.toFixed(2),
      o.totalCogs.toFixed(2),
      o.netProfit.toFixed(2),
      o.profitMargin.toFixed(2),
      o.adSpendAllocated.toFixed(2),
      o.refundAmount.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "orders.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Create handler ─────────────────────────────────────────────────────────
  const handleCreate = async (form: OrderFormState) => {
    setFormLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber:     form.orderNumber.trim() || undefined,
          orderDate:       form.orderDate,
          status:          form.status,
          customerEmail:   form.customerEmail.trim() || undefined,
          grossRevenue:    n(form.grossRevenue),
          discounts:       n(form.discounts),
          totalCogs:       n(form.totalCogs),
          shippingCost:    n(form.shippingCost),
          transactionFees: n(form.transactionFees),
          taxes:           n(form.taxes),
          refundAmount:    n(form.refundAmount),
          adSpendAllocated:n(form.adSpendAllocated),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setFormError(j.error ?? "Failed to create order");
        return;
      }
      const { order: newOrder } = await res.json();
      setOrders((prev) => [newOrder, ...prev]);
      setShowCreate(false);
      setFormError(null);
      startTransition(() => router.refresh());
    } finally {
      setFormLoading(false);
    }
  };

  // ── Edit handler ───────────────────────────────────────────────────────────
  const handleEdit = async (form: OrderFormState) => {
    if (!editTarget) return;
    setFormLoading(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/orders/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber:     form.orderNumber.trim() || undefined,
          orderDate:       form.orderDate,
          status:          form.status,
          customerEmail:   form.customerEmail.trim() || undefined,
          grossRevenue:    n(form.grossRevenue),
          discounts:       n(form.discounts),
          totalCogs:       n(form.totalCogs),
          shippingCost:    n(form.shippingCost),
          transactionFees: n(form.transactionFees),
          taxes:           n(form.taxes),
          refundAmount:    n(form.refundAmount),
          adSpendAllocated:n(form.adSpendAllocated),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setFormError(j.error ?? "Failed to update order");
        return;
      }
      // Re-fetch updated order from server for accuracy
      const updated = await fetch(`/api/orders/${editTarget.id}`).then((r) => r.json());
      if (updated.order) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === editTarget.id
              ? {
                  ...o,
                  orderNumber:     updated.order.orderNumber,
                  orderDate:       updated.order.orderDate,
                  status:          updated.order.status,
                  customerEmail:   updated.order.customerEmail,
                  grossRevenue:    updated.order.grossRevenue,
                  netRevenue:      updated.order.netRevenue,
                  totalCogs:       updated.order.totalCogs,
                  netProfit:       updated.order.netProfit,
                  profitMargin:    updated.order.profitMargin,
                  adSpendAllocated:updated.order.adSpendAllocated,
                  refundAmount:    updated.order.refundAmount,
                }
              : o
          )
        );
      }
      setEditTarget(null);
      setFormError(null);
    } finally {
      setFormLoading(false);
    }
  };

  // ── Delete handler ─────────────────────────────────────────────────────────
  const handleDeleted = () => {
    if (!deleteTarget) return;
    setOrders((prev) => prev.filter((o) => o.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  // ── Close modals & reset error ─────────────────────────────────────────────
  const closeCreate = () => { setShowCreate(false); setFormError(null); };
  const closeEdit   = () => { setEditTarget(null);  setFormError(null); };

  return (
    <>
      {/* Modals */}
      {showCreate && (
        <OrderFormModal
          title="Add Order"
          submitLabel="Add Order"
          onClose={closeCreate}
          onSubmit={handleCreate}
          loading={formLoading}
          error={formError}
        />
      )}
      {editTarget && (
        <OrderFormModal
          title={`Edit Order #${editTarget.orderNumber ?? editTarget.externalId}`}
          initialValues={orderRowToForm(editTarget)}
          submitLabel="Save Changes"
          onClose={closeEdit}
          onSubmit={handleEdit}
          loading={formLoading}
          error={formError}
        />
      )}
      {deleteTarget && (
        <DeleteOrderModal
          order={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImported={() => {
            setShowCsvImport(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Orders</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">{data.total.toLocaleString()} orders total</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <Input
                className="pl-9 w-56"
                placeholder="Search orders…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goSearch(search)}
              />
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            {canWrite && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowCsvImport(true)}
                >
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" />
                  Add Order
                </Button>
              </>
            )}
          </div>
        </div>

        {!canWrite && (
          <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
            You have read-only access.
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                <tr>
                  {[
                    "Order", "Date", "Status", "Revenue",
                    "COGS", "Net Profit", "Margin", "Ad Spend",
                    ...(canWrite ? [""] : []),
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={cn("divide-y divide-[var(--color-border)]", isPending && "opacity-60")}>
                {orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={canWrite ? 9 : 8}
                      className="px-4 py-12 text-center text-[var(--color-muted-foreground)] text-sm"
                    >
                      No orders found.{" "}
                      {canWrite
                        ? 'Click "Add Order" to create one, or import via CSV.'
                        : "Import orders via CSV or connect a store."}
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[var(--color-muted)]/50 transition-colors group">
                    <td className="px-4 py-3 font-medium text-[var(--color-foreground)] whitespace-nowrap">
                      #{order.orderNumber ?? order.externalId}
                      {order.customerEmail && (
                        <p className="text-xs text-[var(--color-muted-foreground)] font-normal">
                          {order.customerEmail}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)] whitespace-nowrap">
                      {new Date(order.orderDate).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">{statusBadge(order.status)}</td>
                    <td className="px-4 py-3 text-[var(--color-foreground)]">
                      {formatCurrency(order.grossRevenue, currency)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatCurrency(order.totalCogs, currency)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 font-semibold",
                        order.netProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500"
                      )}
                    >
                      {formatCurrency(order.netProfit, currency)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 font-medium",
                        order.profitMargin >= 20
                          ? "text-green-600 dark:text-green-400"
                          : order.profitMargin >= 10
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-500"
                      )}
                    >
                      {formatPercent(order.profitMargin)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      {formatCurrency(order.adSpendAllocated, currency)}
                    </td>

                    {/* Action buttons (canWrite) */}
                    {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Edit — any writer */}
                          <button
                            onClick={() => { setFormError(null); setEditTarget(order); }}
                            title="Edit order"
                            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                            aria-label={`Edit order ${order.orderNumber ?? order.externalId}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {/* Delete — owner/admin only */}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(order)}
                              title="Delete order"
                              className="text-red-400 hover:text-red-600 transition-colors"
                              aria-label={`Delete order ${order.orderNumber ?? order.externalId}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {data.pages > 1 && (
          <div className="flex items-center justify-between text-sm text-[var(--color-muted-foreground)]">
            <p>
              Page {data.page} of {data.pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goPage(data.page - 1)}
                disabled={data.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goPage(data.page + 1)}
                disabled={data.page >= data.pages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
