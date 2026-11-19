/**
 * Campaigns table (Phase 3) — replaces the flat latest-50 card feed.
 * Server-side search, filters, sorting, and pagination; row actions
 * (results, send/retry, cancel, duplicate, edit draft, delete draft,
 * archive); bulk archive; CSV export of the filtered list (up to 100).
 *
 * The table owns its dialogs and action API calls (with sonner toasts)
 * and asks the shell to refetch afterwards; the shell owns the list
 * data, the filters, and the detail drawer.
 */
"use client";

import { useEffect, useState } from "react";
import {
  Mail, MessageCircle, Send, Search, Download, Archive, ArchiveRestore,
  Copy, Pencil, Trash2, MoreHorizontal, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import {
  STATUS_STYLES, TEMPLATE_TYPE_LABELS, inputCls,
  type CampaignRow, type TeamRow,
} from "./types";
import { toCsv, downloadCsv } from "./csv";

export interface TableFilters {
  q: string;
  status: string;
  channel: string;
  templateType: string;
  from: string;
  to: string;
  archived: string;
  sort: string;
  order: string;
}

const PAGE_SIZES = [10, 25, 50];

function audienceLabel(c: CampaignRow, teams: TeamRow[]): string {
  if (c.audienceType === "plan") return `Plan: ${c.audiencePlan}`;
  if (c.audienceType === "team") {
    const t = teams.find((t) => t.id === c.audienceTeamId);
    return `Team: ${t ? t.name : c.audienceTeamId}`;
  }
  if (c.audienceType === "users") return `Specific users (${c.audienceUserIds.length})`;
  if (c.audienceType === "limited") return `Oldest ${c.audienceLimit ?? 25} users`;
  return "All users";
}

export function CampaignsTable({
  campaigns,
  total,
  page,
  pages,
  pageSize,
  loading,
  loadedOnce,
  filters,
  onFiltersChange,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onViewResults,
  onSend,
  sendingId,
  audienceCap,
  teams,
}: {
  campaigns: CampaignRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  loading: boolean;
  loadedOnce: boolean;
  filters: TableFilters;
  onFiltersChange: (f: Partial<TableFilters>) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onRefresh: () => void;
  onViewResults: (c: CampaignRow) => void;
  onSend: (c: CampaignRow) => void;
  sendingId: string | null;
  audienceCap: number;
  teams: TeamRow[];
}) {
  const [search, setSearch] = useState(filters.q);
  const { debouncedValue: debouncedSearch } = useDebouncedValue(search);
  const [selected, setSelected] = useState<string[]>([]);
  const [sendTarget, setSendTarget] = useState<CampaignRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CampaignRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignRow | null>(null);
  const [editTarget, setEditTarget] = useState<CampaignRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Debounced search drives the server-side filter (page resets to 1).
  useEffect(() => {
    if (debouncedSearch !== filters.q) {
      onFiltersChange({ q: debouncedSearch });
      onPageChange(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Selection never survives a refetch of a different page.
  useEffect(() => {
    setSelected([]);
  }, [page, filters.q, filters.status, filters.channel, filters.templateType, filters.from, filters.to, filters.archived]);

  const changeFilter = (f: Partial<TableFilters>) => {
    onFiltersChange(f);
    onPageChange(1);
  };

  const toggleSort = (key: string) => {
    if (filters.sort === key) {
      onFiltersChange({ order: filters.order === "asc" ? "desc" : "asc" });
    } else {
      onFiltersChange({ sort: key, order: "desc" });
    }
  };

  const sortIcon = (key: string) =>
    filters.sort !== key ? null : filters.order === "asc" ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );

  const callAction = async (
    key: string,
    url: string,
    init: RequestInit,
    okMsg: (j: Record<string, unknown>) => string
  ) => {
    setBusy(key);
    try {
      const res = await fetch(url, init);
      const j = await res.json();
      if (!res.ok) throw new Error((j.error as string) ?? "Action failed");
      toast.success(okMsg(j));
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const duplicate = (c: CampaignRow) =>
    callAction(`dup-${c.id}`, `/api/admin/campaigns/${c.id}/duplicate`, { method: "POST" },
      (j) => `Draft "${String(j.name)}" created from "${c.name}".`);

  const archiveSelected = (archived: boolean, ids: string[] = selected) =>
    callAction(
      "bulk-archive",
      "/api/admin/campaigns/bulk-archive",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, archived }),
      },
      (j) =>
        archived
          ? `${Number(j.updated)} campaign${Number(j.updated) === 1 ? "" : "s"} archived${Number(j.skipped) > 0 ? ` (${Number(j.skipped)} skipped — still sending)` : ""}.`
          : `${Number(j.updated)} campaign${Number(j.updated) === 1 ? "" : "s"} restored.`
    );

  const archiveOne = (c: CampaignRow, archived: boolean) => {
    void archiveSelected(archived, [c.id]);
  };

  const deleteDraft = (c: CampaignRow) =>
    callAction(`del-${c.id}`, `/api/admin/campaigns/${c.id}`, { method: "DELETE" },
      () => `Draft "${c.name}" deleted.`);

  const cancelSending = (c: CampaignRow) =>
    callAction(`cancel-${c.id}`, `/api/admin/campaigns/${c.id}/cancel`, { method: "POST" },
      (j) => {
        const s = j.stats as { sent: number; targeted: number };
        return `Send cancelled — ${s.sent} of ${s.targeted} recipients were already processed and are kept; re-sending resumes from there.`;
      });

  const exportCsv = async () => {
    setBusy("export");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filters.q) params.set("q", filters.q);
      if (filters.status) params.set("status", filters.status);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.templateType) params.set("templateType", filters.templateType);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      params.set("archived", filters.archived);
      params.set("sort", filters.sort);
      params.set("order", filters.order);
      const res = await fetch(`/api/admin/campaigns?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const j = await res.json();
      const rows: (string | number | null)[][] = (j.campaigns as CampaignRow[]).map((c) => [
        c.name, c.channel, c.templateType, c.status, c.sentAt ?? "", c.createdAt,
        c.stats.targeted, c.stats.sent, c.stats.delivered, c.stats.failed, c.stats.skipped,
      ]);
      downloadCsv(
        "campaigns.csv",
        toCsv(
          ["Name", "Channel", "Type", "Status", "Sent at", "Created at", "Targeted", "Sent", "Delivered", "Failed", "Skipped"],
          rows
        )
      );
      toast.success(`Exported ${rows.length} campaign${rows.length === 1 ? "" : "s"} (up to 100).`);
    } catch {
      toast.error("Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const allSelected = campaigns.length > 0 && selected.length === campaigns.length;
  const visibleIds = campaigns.map((c) => c.id);

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted-foreground)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or message…"
            aria-label="Search campaigns"
            className="h-9 pl-8"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => changeFilter({ status: e.target.value })}
          aria-label="Filter by status"
          className={cn(inputCls, "w-32")}
        >
          <option value="">All statuses</option>
          {["draft", "sending", "sent", "failed"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filters.channel}
          onChange={(e) => changeFilter({ channel: e.target.value })}
          aria-label="Filter by channel"
          className={cn(inputCls, "w-32")}
        >
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select
          value={filters.templateType}
          onChange={(e) => changeFilter({ templateType: e.target.value })}
          aria-label="Filter by template type"
          className={cn(inputCls, "w-40")}
        >
          <option value="">All types</option>
          {(Object.keys(TEMPLATE_TYPE_LABELS) as (keyof typeof TEMPLATE_TYPE_LABELS)[]).map((t) => (
            <option key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-xs">
          <input
            type="date"
            value={filters.from}
            onChange={(e) => changeFilter({ from: e.target.value })}
            aria-label="From date"
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
          />
          <span className="text-[var(--color-muted-foreground)]">→</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => changeFilter({ to: e.target.value })}
            aria-label="To date"
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
          />
          {(filters.from || filters.to) && (
            <Button variant="ghost" size="sm" onClick={() => changeFilter({ from: "", to: "" })} aria-label="Clear dates">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <select
          value={filters.archived}
          onChange={(e) => changeFilter({ archived: e.target.value })}
          aria-label="Archived filter"
          className={cn(inputCls, "w-32")}
        >
          <option value="false">Active</option>
          <option value="true">Archived</option>
          <option value="all">All</option>
        </select>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={busy === "export"}>
          {busy === "export" ? <Spinner size="sm" label="" /> : <Download className="h-3.5 w-3.5" />}
          Export CSV
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm">
          <span>{selected.length} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void archiveSelected(filters.archived === "true" ? false : true)}
            disabled={busy === "bulk-archive"}
          >
            {filters.archived === "true" ? (
              <><ArchiveRestore className="h-3.5 w-3.5" /> Restore</>
            ) : (
              <><Archive className="h-3.5 w-3.5" /> Archive</>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      {/* ── Table ── */}
      {loading && !loadedOnce ? (
        <ListSkeleton rows={5} />
      ) : campaigns.length === 0 ? (
        <p className="py-6 text-sm text-[var(--color-muted-foreground)]">
          No campaigns match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => setSelected(v ? visibleIds : [])}
                    aria-label="Select all campaigns on this page"
                  />
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("name")} className="font-medium">
                    Campaign {sortIcon("name")}
                  </button>
                </TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("sentAt")} className="font-medium">
                    Sent {sortIcon("sentAt")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("createdAt")} className="font-medium">
                    Created {sortIcon("createdAt")}
                  </button>
                </TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id} className={cn(c.archived && "opacity-60")}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(c.id)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => (v ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                      }
                      aria-label={`Select ${c.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm max-w-56 truncate" title={c.name}>{c.name}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {TEMPLATE_TYPE_LABELS[c.templateType]}
                      {c.archived ? " · archived" : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs">
                      {c.channel === "email" ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                      {c.channel === "email" ? "Email" : "WhatsApp"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-muted-foreground)]">{audienceLabel(c, teams)}</TableCell>
                  <TableCell>
                    <Badge className={cn("text-xs capitalize", STATUS_STYLES[c.status])}>{c.status}</Badge>
                    {c.status === "failed" && c.error && (
                      <p className="mt-1 max-w-48 truncate text-xs text-red-600 dark:text-red-400" title={c.error}>{c.error}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.status === "draft" || c.status === "sending" ? (
                      <span className="text-[var(--color-muted-foreground)]">—</span>
                    ) : (
                      <>
                        {c.stats.sent} sent · {c.stats.failed} failed · {c.stats.skipped} skipped
                        {c.stats.delivered > 0 && <> · {c.stats.delivered} delivered</>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-muted-foreground)]">
                    {c.sentAt ? new Date(c.sentAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-muted-foreground)]">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label={`Actions for ${c.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onViewResults(c)}>View results</DropdownMenuItem>
                        {(c.status === "draft" || c.status === "failed") && (
                          <DropdownMenuItem onClick={() => setSendTarget(c)}>
                            <Send className="h-3.5 w-3.5" /> {c.status === "failed" ? "Retry send" : "Send now"}
                          </DropdownMenuItem>
                        )}
                        {c.status === "sending" && (
                          <DropdownMenuItem onClick={() => setCancelTarget(c)}>Cancel send</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => duplicate(c)} disabled={busy === `dup-${c.id}`}>
                          <Copy className="h-3.5 w-3.5" /> Duplicate
                        </DropdownMenuItem>
                        {c.status === "draft" && (
                          <DropdownMenuItem onClick={() => setEditTarget(c)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit draft
                          </DropdownMenuItem>
                        )}
                        {c.archived ? (
                          <DropdownMenuItem onClick={() => archiveOne(c, false)}>
                            <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => archiveOne(c, true)} disabled={c.status === "sending"}>
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </DropdownMenuItem>
                        )}
                        {(c.status === "draft" || c.archived) && (
                          <DropdownMenuItem onClick={() => setDeleteTarget(c)} className="text-red-600 dark:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Pagination ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Page {page} of {pages} · {total} campaign{total === 1 ? "" : "s"}
          {loading && loadedOnce && " · refreshing…"}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Campaigns per page"
            className={cn(inputCls, "w-24")}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      </div>

      {/* ── Send confirm ── */}
      <AlertDialog open={sendTarget !== null} onOpenChange={(open) => { if (!open) setSendTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sendTarget?.status === "failed" ? "Re-send this campaign?" : "Send this campaign now?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {sendTarget && (
                <>
                  “{sendTarget.name}” sends immediately to{" "}
                  {sendTarget.channel === "whatsapp"
                    ? "WhatsApp users with a phone number on file"
                    : "all matched users"}{" "}
                  (max {audienceCap} recipients).{" "}
                  {sendTarget.status === "failed"
                    ? "Recipients already recorded as sent are carried over and never re-sent."
                    : "A draft can only be sent once — there is no undo."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (sendTarget) onSend(sendTarget);
                setSendTarget(null);
              }}
              disabled={sendTarget !== null && sendingId === sendTarget.id}
            >
              {sendTarget !== null && sendingId === sendTarget.id ? "Sending…" : "Send now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancel confirm ── */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this send?</AlertDialogTitle>
            <AlertDialogDescription>
              “{cancelTarget?.name}” moves to failed. Messages already sent
              stay sent — cancelling never unsends them — and re-sending
              resumes from the progress already recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep sending</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelTarget) cancelSending(cancelTarget);
                setCancelTarget(null);
              }}
            >
              Cancel send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” is deleted permanently. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep draft</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteDraft(deleteTarget);
                setDeleteTarget(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit draft ── */}
      {editTarget && (
        <EditDraftDialog
          campaign={editTarget}
          teams={teams}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function EditDraftDialog({
  campaign,
  teams,
  onClose,
  onSaved,
}: {
  campaign: CampaignRow;
  teams: TeamRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [channel, setChannel] = useState<"email" | "whatsapp">(campaign.channel);
  const [templateType, setTemplateType] = useState(campaign.templateType);
  const [subject, setSubject] = useState(campaign.subject ?? "");
  const [body, setBody] = useState(campaign.body);
  const [whatsappTemplateName, setWhatsappTemplateName] = useState(campaign.whatsappTemplateName ?? "");
  const [audienceType, setAudienceType] = useState(campaign.audienceType);
  const [audiencePlan, setAudiencePlan] = useState(campaign.audiencePlan ?? "free");
  const [audienceTeamId, setAudienceTeamId] = useState(campaign.audienceTeamId ?? "");
  const [audienceLimit, setAudienceLimit] = useState(campaign.audienceLimit ?? 25);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        name: name.trim(),
        channel,
        templateType,
        body: body.trim(),
        audienceType,
      };
      if (channel === "email" && subject.trim()) patch.subject = subject.trim();
      if (channel === "whatsapp") patch.whatsappTemplateName = whatsappTemplateName.trim();
      if (audienceType === "plan") patch.audiencePlan = audiencePlan;
      if (audienceType === "team") patch.audienceTeamId = audienceTeamId;
      if (audienceType === "limited") patch.audienceLimit = audienceLimit;
      const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j.error as string) ?? "Save failed");
      toast.success(`Draft "${name.trim()}" updated.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const valid =
    name.trim().length > 0 &&
    body.trim().length > 0 &&
    (channel !== "whatsapp" || whatsappTemplateName.trim().length > 0) &&
    (audienceType !== "team" || audienceTeamId.length > 0) &&
    (audienceType !== "limited" || (audienceLimit >= 1 && audienceLimit <= 500));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit draft — {campaign.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name" className="text-xs">Campaign name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-channel" className="text-xs">Channel</Label>
              <select
                id="edit-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as "email" | "whatsapp")}
                className={inputCls}
              >
                <option value="email">Email (Resend)</option>
                <option value="whatsapp">WhatsApp (Meta template)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-type" className="text-xs">Template type</Label>
              <select
                id="edit-type"
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value as CampaignRow["templateType"])}
                className={inputCls}
              >
                {(Object.keys(TEMPLATE_TYPE_LABELS) as (keyof typeof TEMPLATE_TYPE_LABELS)[]).map((t) => (
                  <option key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          {channel === "email" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-subject" className="text-xs">Subject (optional)</Label>
              <Input id="edit-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9" />
            </div>
          )}
          {channel === "whatsapp" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-template" className="text-xs">Meta-approved template name</Label>
              <Input id="edit-template" value={whatsappTemplateName} onChange={(e) => setWhatsappTemplateName(e.target.value)} className="h-9" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="edit-body" className="text-xs">Message body</Label>
            <textarea
              id="edit-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={5000}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">Use {"{{name}}"} for the recipient&apos;s first name. {body.length}/5000 characters.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-audience" className="text-xs">Audience</Label>
              <select
                id="edit-audience"
                value={audienceType}
                onChange={(e) => setAudienceType(e.target.value as CampaignRow["audienceType"])}
                className={inputCls}
              >
                <option value="all">All users</option>
                <option value="plan">By plan</option>
                <option value="team">By team</option>
                <option value="users">Specific users</option>
                <option value="limited">Limited users</option>
              </select>
              {audienceType === "users" && (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  The {campaign.audienceUserIds.length} selected users are kept
                  as-is — to change them, duplicate this draft and pick a new
                  audience.
                </p>
              )}
            </div>
            {audienceType === "plan" && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-plan" className="text-xs">Plan</Label>
                <select id="edit-plan" value={audiencePlan} onChange={(e) => setAudiencePlan(e.target.value)} className={inputCls}>
                  {["free", "starter", "growth", "pro"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
            {audienceType === "team" && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-team" className="text-xs">Team</Label>
                <select id="edit-team" value={audienceTeamId} onChange={(e) => setAudienceTeamId(e.target.value)} className={inputCls}>
                  <option value="">Select a team…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>
                  ))}
                </select>
              </div>
            )}
            {audienceType === "limited" && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-limit" className="text-xs">Number of users (1–500)</Label>
                <Input
                  id="edit-limit"
                  type="number"
                  min={1}
                  max={500}
                  value={audienceLimit}
                  onChange={(e) => setAudienceLimit(Number(e.target.value))}
                  className="h-9"
                />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || saving}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
