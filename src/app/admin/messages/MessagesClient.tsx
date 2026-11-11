"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, RefreshCw, MailCheck, MailX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SUPPORT_TOPICS, SUPPORT_TOPIC_LABELS } from "@/lib/support";
import { MESSAGE_STATUSES, MESSAGE_STATUS_LABELS } from "@/lib/admin-messages";

interface MessageRow {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  userAgent: string | null;
  status: "new" | "replied" | "closed";
  emailSent: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse {
  messages: MessageRow[];
  total: number;
  page: number;
  pages: number;
  stats: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  new:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  replied: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const TOPIC_COLORS: Record<string, string> = {
  billing:         "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "connect-store": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "ad-accounts":   "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  bug:             "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "feature-request": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  other:           "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function MessagesClient() {
  const [data,    setData]    = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState("");
  const [topic,   setTopic]   = useState("");
  const [page,    setPage]    = useState(1);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (topic)  params.set("topic", topic);
      const res = await fetch(`/api/admin/messages?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      setError("Failed to load messages.");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, topic]);

  // Mount-time data fetch — the effect is the correct place (suppressed: set-state-in-effect)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const messages = data?.messages ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const stats = data?.stats ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Messages</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
          {total.toLocaleString()} contact-form message{total === 1 ? "" : "s"} from the Help Center
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {MESSAGE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(status === s ? "" : s); setPage(1); }}
            className={cn(
              "rounded-xl px-4 py-3 text-left transition-all border",
              status === s
                ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40",
              STATUS_COLORS[s]
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide">{MESSAGE_STATUS_LABELS[s]}</p>
            <p className="text-xl font-bold mt-0.5">{stats[s] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
          <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Filters + table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-52 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9"
              />
            </div>
            <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {MESSAGE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{MESSAGE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={topic || "all"} onValueChange={(v) => { setTopic(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="All topics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics</SelectItem>
                {SUPPORT_TOPICS.map((t) => (
                  <SelectItem key={t} value={t}>{SUPPORT_TOPIC_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 h-9">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-14 text-center text-sm text-[var(--color-muted-foreground)]">
              No messages found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    {["Sender", "Topic", "Message", "Status", "Inbox email", "Received"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {messages.map((m) => (
                    <tr key={m.id} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/admin/messages/${m.id}`} className="block min-w-0">
                          <p className="font-medium text-[var(--color-foreground)] truncate max-w-[160px]">{m.name}</p>
                          <p className="text-xs text-[var(--color-muted-foreground)] truncate max-w-[160px]">{m.email}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", TOPIC_COLORS[m.topic] ?? TOPIC_COLORS.other)}>
                          {SUPPORT_TOPIC_LABELS[m.topic as keyof typeof SUPPORT_TOPIC_LABELS] ?? m.topic}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <Link href={`/admin/messages/${m.id}`} className="block truncate text-[var(--color-muted-foreground)]">
                          {m.message}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", STATUS_COLORS[m.status])}>
                          {MESSAGE_STATUS_LABELS[m.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m.emailSent ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <MailCheck className="h-3.5 w-3.5" /> Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                            <MailX className="h-3.5 w-3.5" /> Not sent
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleDateString()} {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Page {page} of {pages} · {total} messages
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="h-7 w-7 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="h-7 w-7 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
