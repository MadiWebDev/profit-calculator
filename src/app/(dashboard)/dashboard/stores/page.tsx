"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Store { id: string; name: string; platform: string; domain?: string; currency: string; syncStatus: string; lastSyncAt?: string | null; ordersCount: number; syncError?: string | null }

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/stores");
      if (!res.ok) throw new Error("load failed");
      setStores((await res.json()).stores ?? []);
    } catch { setError("Could not load stores. Check your connection and try again."); }
    finally { setLoading(false); }
  };

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => { load(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resync = async (id: string) => {
    setMsg(null);
    const res = await fetch(`/api/stores/${id}/sync`, { method: "POST" });
    setMsg(res.ok ? "Re-sync started for that store. Its status updates on the next load." : "Re-sync could not be started for that store.");
    await load();
  };

  const disconnect = async (id: string) => {
    if (!confirm("Disconnect this store? Its order history stays, but syncing stops.")) return;
    const res = await fetch(`/api/stores/${id}`, { method: "DELETE" });
    setMsg(res.ok ? "Store disconnected." : "Could not disconnect that store.");
    await load();
  };

  if (loading) return <div className="grid gap-4" role="status" aria-label="Loading">{Array.from({ length: 2 }).map((_, i) => (<Card key={i}><CardContent className="h-20 animate-pulse bg-[var(--color-muted)]/40" /></Card>))}</div>;
  if (error) return <Card><CardContent className="py-8 text-center space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={load}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Stores</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Connect, disconnect, and re-sync stores. The multi-store switcher is the Store filter on every report page; consolidated views use “All stores” with a currency filter, so currencies are never mixed in one total.</p>
        </div>
        <Link href="/dashboard/settings?tab=stores" className="ml-auto text-sm font-medium text-[var(--color-primary)] underline">Connect a store →</Link>
      </div>
      {msg && <p className="text-sm text-[var(--color-muted-foreground)]">{msg}</p>}
      {stores.length === 0 && (
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">No stores connected yet. Connect your Shopify store to start syncing orders.</p>
          <Link href="/onboarding" className="text-sm font-medium text-[var(--color-primary)] underline">Start onboarding →</Link>
        </CardContent></Card>
      )}
      {stores.map((s) => (
        <Card key={s.id}><CardHeader><CardTitle>{s.name} <span className="text-sm font-normal text-[var(--color-muted-foreground)]">· {s.platform}{s.domain ? ` · ${s.domain}` : ""} · {s.currency}</span></CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[var(--color-muted-foreground)]">Sync: {s.syncStatus}{s.lastSyncAt ? ` · last ${new Date(s.lastSyncAt).toLocaleString()}` : ""} · {s.ordersCount} orders{s.syncError ? ` · Error: ${s.syncError}` : ""}</span>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => resync(s.id)}>Re-sync</Button>
              <Button size="sm" variant="outline" onClick={() => disconnect(s.id)}>Disconnect</Button>
            </span>
          </CardContent></Card>
      ))}
      <p className="text-xs text-[var(--color-muted-foreground)]">Sync log: each store&apos;s last sync time and error above is the sync log summary. Full webhook and job history lives under Settings → Jobs and the Audit Log.</p>
    </div>
  );
}
