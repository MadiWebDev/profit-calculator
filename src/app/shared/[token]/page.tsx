"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export default function SharedViewPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<{ name: string; kpis: string[]; values: Record<string, number>; period: { from: string; to: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/shared-views/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 410 ? "This share link has expired." : "Share link not found.");
        setData(await r.json());
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (error) return <main className="max-w-2xl mx-auto p-8"><h1 className="text-xl font-bold">Shared report</h1><p className="text-sm text-red-600 mt-2">{error}</p></main>;
  if (!data) return <main className="max-w-2xl mx-auto p-8"><p className="text-sm text-[var(--color-muted-foreground)]">Loading shared report…</p></main>;

  const fmt = (k: string, v: number) => {
    if (k === "netMargin" || k === "refundRate" || k === "rtoRate") return `${v}%`;
    if (k === "orderCount") return String(v);
    if (k === "roas") return `${v}x`;
    return formatCurrency(v);
  };

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-4">
      <h1 className="text-2xl font-bold">{data.name}</h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">Shared read-only report · {data.period.from} → {data.period.to} · Aggregates only, no order-level data.</p>
      <div className="grid grid-cols-2 gap-4">
        {data.kpis.map((k) => (
          <div key={k} className="border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted-foreground)]">{k}</p>
            <p className="text-xl font-bold">{fmt(k, data.values[k] ?? 0)}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
