/**
 * Suppression tab (Phase 3) — the Phase 1 suppression list, visible.
 * Every entry is a real record: who is blocked, on which channel, why,
 * and where it came from. Removing an entry unblocks the address/phone
 * for future sends; it does not rewrite the user's recorded opt-out.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface SuppressionRow {
  id: string;
  identifier: string;
  channel: string;
  reason: string;
  source: string;
  campaignId: string | null;
  createdAt: string;
}

const REASON_STYLES: Record<string, string> = {
  unsubscribed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  bounced: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  complained: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  manual: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  invalid: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export function SuppressionTab() {
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [channel, setChannel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (channel) params.set("channel", channel);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/suppressions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load suppressions");
      const j = await res.json();
      setRows(j.suppressions ?? []);
      setTotal(j.total ?? 0);
      setPages(j.pages ?? 1);
    } catch {
      setError("Failed to load the suppression list.");
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [page, channel, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const remove = async (row: SuppressionRow) => {
    setRemovingId(row.id);
    try {
      const res = await fetch(`/api/admin/suppressions/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Remove failed");
      toast.success(`Removed ${row.identifier} from the suppression list.`);
      await load();
    } catch {
      toast.error("Could not remove that entry.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-muted-foreground)] max-w-2xl">
        Addresses and phone numbers that will not receive campaign messages:
        bounces, complaints, and unsubscribes. Removing an entry unblocks
        it for future sends — the user&apos;s recorded opt-out stays on
        their profile until they opt back in. Consent enforcement at send
        time lands in Phase 5.
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search identifier…"
            aria-label="Search suppressions"
            className="h-9 pl-8"
          />
        </div>
        <select
          value={channel}
          onChange={(e) => { setChannel(e.target.value); setPage(1); }}
          aria-label="Filter by channel"
          className={cn("h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm", "w-40")}
        >
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="all">All channels (both)</option>
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {loading && !loadedOnce ? (
        <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-[var(--color-muted-foreground)]">
          The suppression list is empty — no bounces, complaints, or
          unsubscribes recorded yet.
        </p>
      ) : (
        <>
          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm break-all">{r.identifier}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {r.channel === "email" ? "Email" : r.channel === "whatsapp" ? "WhatsApp" : "All channels"}
                    {" · "}via {r.source}
                    {r.campaignId ? ` · campaign ${r.campaignId.slice(0, 8)}…` : ""}
                    {" · "}{new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge className={cn("text-xs capitalize", REASON_STYLES[r.reason] ?? REASON_STYLES.unsubscribed)}>
                  {r.reason}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => remove(r)}
                  disabled={removingId === r.id}
                >
                  {removingId === r.id ? (
                    <Spinner size="sm" label="" />
                  ) : (
                    <ShieldOff className="h-3.5 w-3.5" />
                  )}
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-muted-foreground)]">
              Page {page} of {pages} · {total} entr{total === 1 ? "y" : "ies"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
