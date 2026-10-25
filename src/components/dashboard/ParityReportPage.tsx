"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export function MetricTip({ label, tooltip, guideId }: { label: string; tooltip: string; guideId: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Link
        href={`/dashboard/report-guide#${guideId}`}
        title={tooltip}
        aria-label={`${label}: ${tooltip}. Open the report guide.`}
        className="text-[var(--color-primary)] text-xs font-bold"
      >
        ?
      </Link>
    </span>
  );
}

export interface MetricDef {
  key: string;
  label: string;
  format: "money" | "number" | "percent";
  tooltip: string;
  guideId: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  format: "money" | "number" | "percent" | "text";
  guideId?: string;
}

interface Props {
  title: string;
  description: string;
  apiPath: string;
  metrics: MetricDef[];
  columns: ColumnDef[];
  rowKey: string;
  emptyTitle: string;
  emptyAction: { label: string; href: string };
  /** Extra query params (e.g. granularity) appended to every fetch. */
  extraParams?: Record<string, string>;
  /** Extra controls rendered next to the filters (e.g. granularity select). */
  extraFilters?: React.ReactNode;
  /** Rendered above the table when data is present. */
  children?: React.ReactNode;
}

interface StoreOption { id: string; name: string }

function fmt(value: unknown, format: ColumnDef["format"]): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (format === "money") return formatCurrency(Number.isFinite(n) ? n : 0);
  if (format === "percent") return `${Number.isFinite(n) ? n : 0}%`;
  if (format === "number") return Number.isFinite(n) ? String(Math.round(n)) : "0";
  return String(value ?? "—");
}

export function ParityReportPage(props: Props) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [storeId, setStoreId] = useState("");
  const [currency, setCurrency] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [data, setData] = useState<{ totals: Record<string, number>; rows: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>(props.columns[0]?.key ?? "");
  const [sortDesc, setSortDesc] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, ...(props.extraParams ?? {}) });
      if (storeId) params.set("storeId", storeId);
      if (currency) params.set("currency", currency);
      const res = await fetch(`${props.apiPath}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load report");
      const json = await res.json();
      setData(json);
      if (Array.isArray(json.currencies)) setCurrencies(json.currencies);
    } catch {
      setError("Could not load this report. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [from, to, storeId, currency, props.apiPath, props.extraParams]);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((j) => setStores((j.stores ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
      .catch(() => undefined);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial load on mount */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const exportCsv = () => {
    const params = new URLSearchParams({ from, to, format: "csv", ...(props.extraParams ?? {}) });
    if (storeId) params.set("storeId", storeId);
    if (currency) params.set("currency", currency);
    const a = document.createElement("a");
    a.href = `${props.apiPath}?${params.toString()}`;
    a.download = "";
    a.click();
  };

  const rows = [...(data?.rows ?? [])].sort((a, b) => {
    const av = Number(a[sortKey] ?? 0);
    const bv = Number(b[sortKey] ?? 0);
    if (Number.isFinite(av) && Number.isFinite(bv) && av !== bv) return sortDesc ? bv - av : av - bv;
    return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
  });
  const totals = data?.totals ?? {};
  const isEmpty = !loading && !error && rows.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">{props.title}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] max-w-3xl">{props.description}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 ml-auto">
          <div className="space-y-1">
            <Label htmlFor="parity-from">From</Label>
            <Input id="parity-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="parity-to">To</Label>
            <Input id="parity-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="parity-store">Store</Label>
            <select id="parity-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm">
              <option value="">All stores</option>
              {stores.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="parity-currency">Currency</Label>
            <select id="parity-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm">
              <option value="">All currencies</option>
              {currencies.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          {props.extraFilters}
          <Button onClick={load} disabled={loading}>Apply</Button>
          <Button variant="outline" onClick={exportCsv} disabled={loading}>Export CSV</Button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="status" aria-label="Loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="h-24 animate-pulse bg-[var(--color-muted)]/40" /></Card>
          ))}
        </div>
      )}

      {error && !loading && (
        <Card><CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline" onClick={load}>Retry</Button>
        </CardContent></Card>
      )}

      {isEmpty && (
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">{props.emptyTitle}</p>
          <Link href={props.emptyAction.href} className="inline-block text-sm font-medium text-[var(--color-primary)] underline">
            {props.emptyAction.label} →
          </Link>
        </CardContent></Card>
      )}

      {!loading && !error && data && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {props.metrics.map((m) => (
              <Card key={m.key}>
                <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  <MetricTip label={m.label} tooltip={m.tooltip} guideId={m.guideId} />
                </CardTitle></CardHeader>
                <CardContent className="text-xl font-bold">{fmt(totals[m.key], m.format)}</CardContent>
              </Card>
            ))}
          </div>
          {props.children}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left">
                    {props.columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => { if (sortKey === c.key) setSortDesc(!sortDesc); else { setSortKey(c.key); setSortDesc(true); } }}
                          className="hover:underline"
                        >
                          {c.label}{sortKey === c.key ? (sortDesc ? " ↓" : " ↑") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={String(row[props.rowKey] ?? i)} className="border-b border-[var(--color-border)] last:border-0">
                      {props.columns.map((c) => (
                        <td key={c.key} className="px-4 py-2.5 whitespace-nowrap">{fmt(row[c.key], c.format)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--color-border)] font-semibold">
                    {props.columns.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 whitespace-nowrap">
                        {c.format === "text" ? (c.key === props.columns[0]?.key ? "Total" : "") : fmt(totals[c.key], c.format)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Totals are the sum of the rows above, using the same profit formula as the P&amp;L and True Profit pages
            (cancelled orders excluded). Change the filters and the totals recompute from the same orders.
          </p>
        </>
      )}
    </div>
  );
}
