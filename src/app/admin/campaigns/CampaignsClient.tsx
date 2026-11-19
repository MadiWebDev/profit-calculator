"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Megaphone, Mail, MessageCircle, CheckCircle2,
  AlertCircle, RefreshCw, Plus, X, Users, Search, History,
  Phone, PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import type { CampaignDateRangeKey } from "@/lib/campaign-stats";
import {
  TEMPLATE_TYPE_LABELS, STATUS_STYLES, inputCls,
  type CampaignRow, type Channel, type TemplateType, type AudienceType,
  type RecipientRow, type RecipientStatus, type TeamRow,
  type DirectoryUser, type LastMessage, type DirectMessageRow,
} from "./components/types";
import { RecipientTable, TrackingNote } from "./components/RecipientReport";
import { OverviewTab, RangePicker, type StatsState } from "./components/OverviewTab";
import { AnalyticsTab } from "./components/AnalyticsTab";
import { CampaignsTable, type TableFilters } from "./components/CampaignsTable";
import { SuppressionTab } from "./components/SuppressionTab";
import { DirectMessageDialog } from "./components/DirectMessageDialog";

type CenterTab =
  | "overview" | "campaigns" | "create" | "messages" | "users" | "analytics" | "suppression";

const DIRECTORY_PAGE_SIZE = 20;
const PICKER_PAGE_SIZE = 10;

function PhoneBadge({ hasPhone }: { hasPhone: boolean }) {
  return hasPhone ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <Phone className="h-3 w-3" /> WhatsApp ready
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <PhoneOff className="h-3 w-3" /> No phone
    </span>
  );
}

export function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [audienceCap, setAudienceCap] = useState(500);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // True once the first campaigns fetch has settled — refetches (e.g.
  // after sending) keep the list and only the per-row buttons show load.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ recipients: RecipientRow[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Phase 3: tabs + table + stats state ──
  const [activeTab, setActiveTab] = useState<CenterTab>("overview");
  const [tableFilters, setTableFilters] = useState<TableFilters>({
    q: "", status: "", channel: "", templateType: "",
    from: "", to: "", archived: "false", sort: "createdAt", order: "desc",
  });
  const [tablePage, setTablePage] = useState(1);
  const [tablePages, setTablePages] = useState(1);
  const [tableTotal, setTableTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [range, setRange] = useState<CampaignDateRangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stats, setStats] = useState<StatsState>({ loading: true, error: null, data: null });
  // The sent-messages log fetches its own list (the table is paginated
  // now, so the log can no longer derive from the table's page).
  const [logCampaigns, setLogCampaigns] = useState<CampaignRow[]>([]);
  const [logListLoading, setLogListLoading] = useState(true);

  // ── Form state ──
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [templateType, setTemplateType] = useState<TemplateType>("announcement");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [whatsappTemplateName, setWhatsappTemplateName] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [audiencePlan, setAudiencePlan] = useState("free");
  const [audienceTeamId, setAudienceTeamId] = useState("");
  const [audienceLimit, setAudienceLimit] = useState(25);
  const [selectedUsers, setSelectedUsers] = useState<DirectoryUser[]>([]);

  // ── "Specific users" picker state ──
  // Both searches share the one debounced-value hook (replacing the two
  // hand-rolled setTimeout debounces that lived here before).
  const [pickerSearch, setPickerSearch] = useState("");
  const { debouncedValue: debouncedPickerSearch, isPending: pickerSearchPending } = useDebouncedValue(pickerSearch);
  const [pickerPlan, setPickerPlan] = useState("");
  const [pickerResults, setPickerResults] = useState<DirectoryUser[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // ── User directory state ──
  const [dirUsers, setDirUsers] = useState<DirectoryUser[]>([]);
  const [dirTotal, setDirTotal] = useState(0);
  const [dirPage, setDirPage] = useState(1);
  const [dirPages, setDirPages] = useState(1);
  const [dirSearch, setDirSearch] = useState("");
  const { debouncedValue: debouncedDirSearch, isPending: dirSearchPending } = useDebouncedValue(dirSearch);
  const [dirPlan, setDirPlan] = useState("");
  const [dirLoading, setDirLoading] = useState(true);
  const [dirError, setDirError] = useState<string | null>(null);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  // True once the first directory fetch has settled — refetches keep the
  // list and only show an inline spinner.
  const [dirLoadedOnce, setDirLoadedOnce] = useState(false);

  // ── Sent-messages log state ──
  const [logChannel, setLogChannel] = useState<"all" | Channel>("all");
  const [logStatus, setLogStatus] = useState<"all" | RecipientStatus>("all");
  const [logExpandedId, setLogExpandedId] = useState<string | null>(null);
  const [logDetails, setLogDetails] = useState<Record<string, RecipientRow[]>>({});
  const [logLoading, setLogLoading] = useState<Record<string, boolean>>({});

  // ── Direct messages state ──
  // The dialog target (null = closed) and the Messages tab's direct list.
  const [directMessageUser, setDirectMessageUser] = useState<DirectoryUser | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessageRow[]>([]);
  const [directTotal, setDirectTotal] = useState(0);
  const [directPage, setDirectPage] = useState(1);
  const [directPages, setDirectPages] = useState(1);
  const [directLoading, setDirectLoading] = useState(true);
  const [directLoadedOnce, setDirectLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        page: String(tablePage),
        limit: String(pageSize),
      });
      if (tableFilters.q) params.set("q", tableFilters.q);
      if (tableFilters.status) params.set("status", tableFilters.status);
      if (tableFilters.channel) params.set("channel", tableFilters.channel);
      if (tableFilters.templateType) params.set("templateType", tableFilters.templateType);
      if (tableFilters.from) params.set("from", tableFilters.from);
      if (tableFilters.to) params.set("to", tableFilters.to);
      params.set("archived", tableFilters.archived);
      params.set("sort", tableFilters.sort);
      params.set("order", tableFilters.order);
      const [campRes, teamRes] = await Promise.all([
        fetch(`/api/admin/campaigns?${params.toString()}`),
        fetch("/api/admin/teams"),
      ]);
      if (!campRes.ok) throw new Error("Failed to load campaigns");
      const j = await campRes.json();
      setCampaigns(j.campaigns ?? []);
      setTableTotal(j.total ?? 0);
      setTablePages(j.pages ?? 1);
      if (typeof j.audienceCap === "number") setAudienceCap(j.audienceCap);
      if (teamRes.ok) {
        const t = await teamRes.json();
        setTeams(t.teams ?? []);
      }
    } catch {
      setError("Failed to load campaigns.");
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [tablePage, pageSize, tableFilters]);

  // Mount-time data fetch — the effect is the correct place (suppressed: set-state-in-effect)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Overview + Analytics stats, driven by the shared date range.
  const loadStats = useCallback(async () => {
    setStats((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ range });
      if (range === "custom") {
        if (customFrom) params.set("from", customFrom);
        if (customTo) params.set("to", customTo);
      }
      const res = await fetch(`/api/admin/campaigns/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load campaign stats");
      const j = await res.json();
      setStats({
        loading: false,
        error: null,
        data: {
          kpis: j.kpis,
          daily: j.daily ?? [],
          byChannel: j.byChannel ?? [],
          byType: j.byType ?? [],
          byPlan: j.byPlan ?? [],
          hasTracking: !!j.hasTracking,
          range: j.range,
          from: j.from,
          to: j.to,
        },
      });
    } catch {
      setStats((prev) => ({ ...prev, loading: false, error: "Failed to load campaign stats." }));
    }
  }, [range, customFrom, customTo]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadStats(); }, [loadStats]);

  // The sent-messages log's own list (status sent/failed, latest 50).
  const loadLogCampaigns = useCallback(async () => {
    setLogListLoading(true);
    try {
      const [sentRes, failedRes] = await Promise.all([
        fetch("/api/admin/campaigns?status=sent&limit=50"),
        fetch("/api/admin/campaigns?status=failed&limit=50"),
      ]);
      const rows: CampaignRow[] = [];
      for (const res of [sentRes, failedRes]) {
        if (res.ok) {
          const j = await res.json();
          rows.push(...(j.campaigns ?? []));
        }
      }
      rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      setLogCampaigns(rows);
    } finally {
      setLogListLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLogCampaigns(); }, [loadLogCampaigns]);

  // The direct-messages list for the Messages tab. Shares the tab's
  // channel filter with the campaign log.
  const loadDirectMessages = useCallback(async () => {
    setDirectLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(directPage),
        limit: "20",
      });
      if (logChannel !== "all") params.set("channel", logChannel);
      const res = await fetch(`/api/admin/direct-messages?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load direct messages");
      const j = await res.json();
      setDirectMessages(j.directMessages ?? []);
      setDirectTotal(j.total ?? 0);
      setDirectPages(j.pages ?? 1);
    } catch {
      setDirectMessages([]);
    } finally {
      setDirectLoading(false);
      setDirectLoadedOnce(true);
    }
  }, [directPage, logChannel]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadDirectMessages(); }, [loadDirectMessages]);

  // Efficient polling (Phase 3): every 30s while the Overview or
  // Campaigns tab is visible — skipped when the tab is hidden, and
  // manual Refresh is always available. No WebSocket server exists in
  // this stack.
  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "campaigns") return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load();
      void loadStats();
    }, 30_000);
    return () => clearInterval(id);
  }, [activeTab, load, loadStats]);

  const loadDirectory = useCallback(async () => {
    setDirLoading(true); setDirError(null);
    try {
      const params = new URLSearchParams({
        page: String(dirPage),
        limit: String(DIRECTORY_PAGE_SIZE),
      });
      if (debouncedDirSearch) params.set("search", debouncedDirSearch);
      if (dirPlan) params.set("plan", dirPlan);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load users");
      const j = await res.json();
      const users: DirectoryUser[] = (j.users ?? []).map((u: {
        id: string; name: string; email: string; plan: string; hasPhone: boolean; createdAt: string;
      }) => ({
        id: u.id, name: u.name, email: u.email, plan: u.plan,
        hasPhone: !!u.hasPhone, createdAt: u.createdAt,
      }));
      setDirUsers(users);
      setDirTotal(j.total ?? 0);
      setDirPages(j.pages ?? 1);
      if (users.length > 0) {
        // One request for the whole page — never one fetch per user.
        const lmRes = await fetch(
          `/api/admin/campaigns/last-message?userIds=${users.map((u) => u.id).join(",")}`
        );
        if (lmRes.ok) {
          const lm = await lmRes.json();
          setLastMessages(lm.lastMessages ?? {});
        } else {
          setLastMessages({});
        }
      } else {
        setLastMessages({});
      }
    } catch {
      setDirError("Failed to load users.");
    } finally {
      setDirLoading(false);
      setDirLoadedOnce(true);
    }
  }, [dirPage, debouncedDirSearch, dirPlan]);

  // Directory fetch on mount and whenever page/search/plan changes
  // (suppressed: set-state-in-effect — same mount-time fetch pattern as load()).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadDirectory(); }, [loadDirectory]);

  // "Specific users" picker results — only while the Create tab is
  // open on that audience. The search term is already debounced by the
  // shared hook, so this fetches immediately on the settled value (the
  // old code wrapped the fetch in a second 300 ms timeout — a 600 ms
  // lag in total).
  useEffect(() => {
    if (activeTab !== "create" || audienceType !== "users") return;
    let cancelled = false;
    (async () => {
      setPickerLoading(true);
      try {
        const params = new URLSearchParams({ limit: String(PICKER_PAGE_SIZE) });
        if (debouncedPickerSearch) params.set("search", debouncedPickerSearch);
        if (pickerPlan) params.set("plan", pickerPlan);
        const res = await fetch(`/api/admin/users?${params.toString()}`);
        if (res.ok && !cancelled) {
          const j = await res.json();
          setPickerResults((j.users ?? []).map((u: {
            id: string; name: string; email: string; plan: string; hasPhone: boolean; createdAt: string;
          }) => ({
            id: u.id, name: u.name, email: u.email, plan: u.plan,
            hasPhone: !!u.hasPhone, createdAt: u.createdAt,
          })));
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, audienceType, debouncedPickerSearch, pickerPlan]);

  const flash = (type: "ok" | "err", msg: string) => {
    if (type === "ok") { setSuccess(msg); setError(null); }
    else { setError(msg); setSuccess(null); }
  };

  const createAction = useAsyncAction(async () => {
    if (!name.trim() || !body.trim()) return;
    if (audienceType === "users" && selectedUsers.length === 0) return;
    if (audienceType === "limited" && (audienceLimit < 1 || audienceLimit > 500)) return;
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        channel,
        templateType,
        body: body.trim(),
        audienceType,
      };
      if (channel === "email" && subject.trim()) payload.subject = subject.trim();
      if (channel === "whatsapp") payload.whatsappTemplateName = whatsappTemplateName.trim();
      if (audienceType === "plan") payload.audiencePlan = audiencePlan;
      if (audienceType === "team") payload.audienceTeamId = audienceTeamId;
      if (audienceType === "users") payload.audienceUserIds = selectedUsers.map((u) => u.id);
      if (audienceType === "limited") payload.audienceLimit = audienceLimit;
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Create failed");
      const a = j.audience as { matched: number; withContact: number; withoutContact: number; willSend: number; capped: number } | undefined;
      flash(
        "ok",
        a
          ? `Draft created. Audience: ${a.withContact} reachable of ${a.matched} matched` +
            (a.withoutContact > 0 ? ` (${a.withoutContact} without a ${channel === "whatsapp" ? "phone number" : "contact"} will be skipped)` : "") +
            (a.capped > 0 ? ` — ${a.capped} over the ${audienceCap} cap will not be sent.` : ". Review it below, then Send.")
          : "Draft created."
      );
      setActiveTab("campaigns");
      setName(""); setSubject(""); setBody(""); setWhatsappTemplateName("");
      setAudienceType("all");
      setSelectedUsers([]);
      setPickerSearch(""); setPickerPlan("");
      setAudienceLimit(25);
      await load();
      await loadLogCampaigns();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Create failed.");
    }
  });

  const createCampaign = () => {
    void createAction.run();
  };

  const openDetail = async (id: string): Promise<RecipientRow[] | null> => {
    setDetailId(id); setLoadingDetail(true); setDetail(null); setDrawerOpen(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`);
      if (!res.ok) throw new Error("Failed to load detail");
      const j = await res.json();
      setDetail(j);
      return (j.recipients ?? []) as RecipientRow[];
    } catch {
      flash("err", "Failed to load campaign detail.");
      setDetailId(null);
      setDrawerOpen(false);
      return null;
    } finally {
      setLoadingDetail(false);
    }
  };

  // Sends are confirmed by the table's AlertDialog (Phase 3 — no more
  // window.confirm); this is the do-send implementation.
  const sendCampaign = async (campaign: CampaignRow) => {
    setSendingId(campaign.id);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/send`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Send failed");
      const s = j.stats as { targeted: number; sent: number; failed: number; skipped: number };
      setDetailId(null); setDetail(null);
      await load();
      await loadLogCampaigns();
      // Open the per-recipient results immediately so the exact reason
      // for every skip/failure is visible without another click.
      const recipients = await openDetail(campaign.id);
      let reason = "";
      if (recipients) {
        const counts = new Map<string, number>();
        for (const r of recipients) {
          if (r.status !== "sent" && r.error) counts.set(r.error, (counts.get(r.error) ?? 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) {
          reason = ` Most common reason: “${top[0]}” (${top[1]} recipient${top[1] === 1 ? "" : "s"}).`;
        }
      }
      flash(
        "ok",
        `Sent: ${s.sent} sent, ${s.failed} failed, ${s.skipped} skipped of ${s.targeted} targeted` +
        `${j.overflow ? ` (${j.overflow} over the cap were not sent)` : ""}.` +
        reason +
        (s.failed > 0 || s.skipped > 0 ? " Full per-recipient reasons are in Results below." : "")
      );
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSendingId(null);
    }
  };

  const audienceLabel = (c: CampaignRow) => {
    if (c.audienceType === "plan") return `Plan: ${c.audiencePlan}`;
    if (c.audienceType === "team") {
      const t = teams.find((t) => t.id === c.audienceTeamId);
      return `Team: ${t ? t.name : c.audienceTeamId}`;
    }
    if (c.audienceType === "users") return `Specific users (${c.audienceUserIds.length})`;
    if (c.audienceType === "limited") return `Oldest ${c.audienceLimit ?? 25} users`;
    return "All users";
  };

  // ── User directory: Message button opens the direct-message dialog
  // for one user — no campaign is created. The composer pre-fill this
  // used to do (jump to Create with the user as a "users" audience) is
  // gone; campaigns still use the Create tab as before.
  const messageUser = (u: DirectoryUser) => {
    setDirectMessageUser(u);
  };

  const addSelectedUser = (u: DirectoryUser) => {
    setSelectedUsers((prev) =>
      prev.some((s) => s.id === u.id) || prev.length >= 500 ? prev : [...prev, u]
    );
  };

  const removeSelectedUser = (id: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id));
  };

  // ── Sent-messages log ──
  const sentCampaigns = useMemo(
    () =>
      logCampaigns.filter(
        (c) =>
          (c.status === "sent" || c.status === "failed") &&
          (logChannel === "all" || c.channel === logChannel)
      ),
    [logCampaigns, logChannel]
  );

  const loadLogDetail = useCallback(async (id: string) => {
    setLogLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`);
      if (!res.ok) return;
      const j = await res.json();
      setLogDetails((prev) => ({ ...prev, [id]: (j.recipients ?? []) as RecipientRow[] }));
    } finally {
      setLogLoading((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  const openLogDetail = (id: string) => {
    if (logExpandedId === id) { setLogExpandedId(null); return; }
    setLogExpandedId(id);
    if (!(id in logDetails) && !logLoading[id]) void loadLogDetail(id);
  };

  // When filtering the log by recipient status, the per-recipient
  // results have to be loaded for every visible campaign first, so a
  // campaign with no matching recipient can be hidden.
  /* eslint-disable react-hooks/set-state-in-effect -- this effect is a
     data fetch triggered by the filter state (same pattern as load());
     the report at the inner call site is not suppressible line-by-line */
  useEffect(() => {
    if (logStatus === "all") return;
    for (const c of sentCampaigns) {
      if (!(c.id in logDetails) && !logLoading[c.id]) void loadLogDetail(c.id);
    }
  }, [logStatus, sentCampaigns, logDetails, logLoading, loadLogDetail]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const visibleLogCampaigns = useMemo(() => {
    if (logStatus === "all") return sentCampaigns;
    return sentCampaigns.filter((c) => {
      const recipients = logDetails[c.id];
      // Until a campaign's results have loaded, keep it visible so the
      // list does not flicker rows away mid-load.
      if (!recipients) return true;
      return recipients.some((r) => r.status === logStatus);
    });
  }, [sentCampaigns, logStatus, logDetails]);

  const logDetailsPending =
    logStatus !== "all" &&
    sentCampaigns.some((c) => !(c.id in logDetails) && logLoading[c.id]);

  const selectedWithoutPhone =
    channel === "whatsapp" ? selectedUsers.filter((u) => !u.hasPhone).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Campaigns
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1 max-w-2xl">
            Send an email or WhatsApp message to your users. Campaigns are drafts until you
            hit Send, and each send is capped at {audienceCap} recipients. WhatsApp sends
            use a Meta-approved template — create it in Business Manager first.
            No scheduling in this version: sending happens immediately.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void load(); void loadStats(); void loadLogCampaigns(); }}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setActiveTab("create")}>
            <Plus className="h-3.5 w-3.5" />
            New Campaign
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div role="status" className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {success}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CenterTab)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="suppression">Suppression</TabsTrigger>
        </TabsList>

        {(activeTab === "overview" || activeTab === "analytics") && (
          <div className="pt-4">
            <RangePicker
              range={range}
              customFrom={customFrom}
              customTo={customTo}
              onRangeChange={(r) => setRange(r)}
              onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to); }}
            />
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Every stat, chart, and list on this page follows the range
              above. Templates, saved audiences, and sender settings arrive
              in Phases 4–5 — the tabs above cover what exists today.
            </p>
          </div>
        )}

        <TabsContent value="overview" className="pt-4">
          <OverviewTab stats={stats} />
        </TabsContent>

        <TabsContent value="campaigns" className="pt-4">
          <CampaignsTable
            campaigns={campaigns}
            total={tableTotal}
            page={tablePage}
            pages={tablePages}
            pageSize={pageSize}
            loading={loading}
            loadedOnce={loadedOnce}
            filters={tableFilters}
            onFiltersChange={(f) => setTableFilters((prev) => ({ ...prev, ...f }))}
            onPageChange={setTablePage}
            onPageSizeChange={(size) => { setPageSize(size); setTablePage(1); }}
            onRefresh={() => { void load(); void loadStats(); void loadLogCampaigns(); }}
            onViewResults={(c) => void openDetail(c.id)}
            onSend={(c) => void sendCampaign(c)}
            sendingId={sendingId}
            audienceCap={audienceCap}
            teams={teams}
          />
        </TabsContent>

        <TabsContent value="create" className="pt-4">
        {/* ── New campaign form ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" /> New Campaign (draft)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-w-2xl">
            <fieldset disabled={createAction.loading} className="space-y-4 border-0 m-0 min-w-0 p-0">
            <div className="space-y-1.5">
              <Label className="text-xs">Campaign name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. November feature launch" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Channel</Label>
                <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={inputCls}>
                  <option value="email">Email (Resend)</option>
                  <option value="whatsapp">WhatsApp (Meta template)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Template type</Label>
                <select value={templateType} onChange={(e) => setTemplateType(e.target.value as TemplateType)} className={inputCls}>
                  {(Object.keys(TEMPLATE_TYPE_LABELS) as TemplateType[]).map((t) => (
                    <option key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>
            {channel === "email" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Subject (optional — defaults to the template type&apos;s subject)</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Leave blank for the default subject" className="h-9" />
                <p className="text-xs text-[var(--color-muted-foreground)]">Every email includes an unsubscribe footer (reply to unsubscribe).</p>
              </div>
            )}
            {channel === "whatsapp" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Meta-approved template name</Label>
                <Input
                  value={whatsappTemplateName}
                  onChange={(e) => setWhatsappTemplateName(e.target.value)}
                  placeholder="e.g. november_launch"
                  className="h-9"
                />
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  The exact template name from Meta Business Manager (lowercase letters, digits, underscores).
                  It must already be approved there — if Meta rejects it, the exact error is shown per recipient.
                  {"{{1}}"} in the template is filled with the recipient&apos;s first name.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Message body</Label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Write the message… Use {{name}} for the recipient's first name."
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">Use {"{{name}}"} for the recipient&apos;s first name. {body.length}/5000 characters.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Audience</Label>
                <select value={audienceType} onChange={(e) => setAudienceType(e.target.value as AudienceType)} className={inputCls}>
                  <option value="all">All users</option>
                  <option value="plan">By plan</option>
                  <option value="team">By team</option>
                  <option value="users">Specific users</option>
                  <option value="limited">Limited users</option>
                </select>
              </div>
              {audienceType === "plan" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Plan</Label>
                  <select value={audiencePlan} onChange={(e) => setAudiencePlan(e.target.value)} className={inputCls}>
                    {["free", "starter", "growth", "pro"].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
              {audienceType === "team" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Team</Label>
                  <select value={audienceTeamId} onChange={(e) => setAudienceTeamId(e.target.value)} className={inputCls}>
                    <option value="">Select a team…</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>
                    ))}
                  </select>
                </div>
              )}
              {audienceType === "limited" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Number of users (1–500)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={audienceLimit}
                    onChange={(e) => setAudienceLimit(Number(e.target.value))}
                    className="h-9"
                  />
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Targets the {audienceLimit} oldest users by account creation date. The exact
                    reachable count is shown in the estimate when the draft is created.
                  </p>
                </div>
              )}
            </div>

            {/* ── Specific-users picker ── */}
            {audienceType === "users" && (
              <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
                <Label className="text-xs">Select users ({selectedUsers.length} selected, max 500)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted-foreground)]" />
                    <Input
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="h-9 pl-8 pr-8"
                    />
                    {(pickerSearchPending || pickerLoading) && (
                      <span className="absolute right-2.5 top-2.5 text-[var(--color-muted-foreground)]">
                        <Spinner size="sm" label="" />
                      </span>
                    )}
                  </div>
                  <select value={pickerPlan} onChange={(e) => setPickerPlan(e.target.value)} className={inputCls}>
                    <option value="">All plans</option>
                    {["free", "starter", "growth", "pro"].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                {selectedWithoutPhone > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {selectedWithoutPhone} selected user{selectedWithoutPhone === 1 ? "" : "s"} {selectedWithoutPhone === 1 ? "has" : "have"} no
                    phone number on file and will be skipped for WhatsApp (recorded as “No phone number on file”).
                  </p>
                )}
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUsers.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs"
                      >
                        {u.name || u.email}
                        {!u.hasPhone && channel === "whatsapp" && (
                          <span className="text-amber-700 dark:text-amber-300">(no phone)</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSelectedUser(u.id)}
                          aria-label={`Remove ${u.name || u.email}`}
                          className="rounded-full hover:bg-[var(--color-border)] p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {pickerLoading ? (
                  <p className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-2">
                    <Spinner size="sm" label="" /> Searching…
                  </p>
                ) : pickerResults.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    No users match — try a different search or plan filter.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-border)]">
                    {pickerResults.map((u) => {
                      const already = selectedUsers.some((s) => s.id === u.id);
                      return (
                        <div key={u.id} className="flex items-center gap-2 py-1.5 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{u.name || "—"}</p>
                            <p className="text-[var(--color-muted-foreground)] truncate">{u.email}</p>
                          </div>
                          <Badge className="text-xs capitalize bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {u.plan}
                          </Badge>
                          <PhoneBadge hasPhone={u.hasPhone} />
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={already || selectedUsers.length >= 500}
                            onClick={() => addSelectedUser(u)}
                          >
                            {already ? "Added" : "Add"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-[var(--color-muted-foreground)]">
              {channel === "whatsapp"
                ? `WhatsApp sends only reach users with a phone number on file (set in Dashboard → Settings → Profile). Users without one are skipped and counted.`
                : `Emails go to every matched user (max ${audienceCap} per send).`}
            </p>
            <Button
              size="sm"
              onClick={createCampaign}
              loading={createAction.loading}
              loadingText="Creating draft…"
              disabled={
                !name.trim() || !body.trim() ||
                (channel === "whatsapp" && !whatsappTemplateName.trim()) ||
                (audienceType === "team" && !audienceTeamId) ||
                (audienceType === "users" && selectedUsers.length === 0) ||
                (audienceType === "limited" && (audienceLimit < 1 || audienceLimit > 500))
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Create Draft
            </Button>
            </fieldset>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="users" className="pt-4">
      {/* ── User directory ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Users
            <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
              {dirTotal} total
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="relative flex-1 min-w-52">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-[var(--color-muted-foreground)]" />
              <Input
                value={dirSearch}
                onChange={(e) => { setDirSearch(e.target.value); setDirPage(1); }}
                placeholder="Search by name or email…"
                className="h-9 pl-8 pr-8"
              />
              {(dirSearchPending || dirLoading) && (
                <span className="absolute right-2.5 top-2.5 text-[var(--color-muted-foreground)]">
                  <Spinner size="sm" label="" />
                </span>
              )}
            </div>
            <select
              value={dirPlan}
              onChange={(e) => { setDirPlan(e.target.value); setDirPage(1); }}
              className={cn(inputCls, "w-40")}
            >
              <option value="">All plans</option>
              {["free", "starter", "growth", "pro"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {dirError && (
            <p role="alert" className="p-4 text-sm text-red-600 dark:text-red-400">{dirError}</p>
          )}
          {dirLoading && !dirLoadedOnce ? (
            <div className="p-4"><ListSkeleton rows={5} /></div>
          ) : dirUsers.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted-foreground)]">
              No users match.
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--color-border)]">
                {dirUsers.map((u) => {
                  const lm = lastMessages[u.id];
                  return (
                    <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{u.name || "—"}</p>
                        <p className="text-xs text-[var(--color-muted-foreground)] truncate">{u.email}</p>
                        <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                          {lm ? (
                            <>
                              Last message: {lm.channel === "email" ? "Email" : "WhatsApp"}
                              {" · "}{lm.status}
                              {lm.sentAt ? ` · ${new Date(lm.sentAt).toLocaleDateString()}` : ""}
                              {` · “${lm.campaignName}”`}
                            </>
                          ) : (
                            "No messages sent yet"
                          )}
                        </p>
                      </div>
                      <Badge className="text-xs capitalize bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {u.plan}
                      </Badge>
                      <PhoneBadge hasPhone={u.hasPhone} />
                      <Button variant="outline" size="sm" onClick={() => messageUser(u)}>
                        <Mail className="h-3.5 w-3.5" /> Message
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] p-3">
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  Page {dirPage} of {dirPages} · {dirTotal} user{dirTotal === 1 ? "" : "s"}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dirPage <= 1 || dirLoading}
                    onClick={() => setDirPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dirPage >= dirPages || dirLoading}
                    onClick={() => setDirPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="messages" className="pt-4">
      {/* ── Sent-messages log ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Sent messages
            <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
              every campaign and direct send, with per-recipient results
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-3 pt-1">
            <select value={logChannel} onChange={(e) => setLogChannel(e.target.value as "all" | Channel)} className={cn(inputCls, "w-40")}>
              <option value="all">All channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <select value={logStatus} onChange={(e) => setLogStatus(e.target.value as "all" | RecipientStatus)} className={cn(inputCls, "w-44")}>
              <option value="all">All recipient statuses</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="opened">Opened</option>
              <option value="clicked">Clicked</option>
              <option value="read">Read</option>
              <option value="bounced">Bounced</option>
              <option value="complained">Complained</option>
              <option value="suppressed">Suppressed</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logListLoading ? (
            <div className="p-4"><ListSkeleton rows={3} /></div>
          ) : sentCampaigns.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted-foreground)]">
              Nothing sent yet.
            </div>
          ) : visibleLogCampaigns.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted-foreground)]">
              No sent messages match these filters.
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {logDetailsPending && (
                <p className="flex items-center gap-2 p-3 text-xs text-[var(--color-muted-foreground)]">
                  <Spinner size="sm" label="" /> Loading per-recipient results to apply the status filter…
                </p>
              )}
              {visibleLogCampaigns.map((c) => (
                <div key={c.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-muted)] flex-shrink-0">
                      {c.channel === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{c.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {c.channel === "email" ? "Email" : "WhatsApp"}
                        {" · "}{audienceLabel(c)}
                        {c.sentAt ? ` · sent ${new Date(c.sentAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <Badge className={cn("text-xs capitalize", STATUS_STYLES[c.status])}>{c.status}</Badge>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {c.stats.sent} sent · {c.stats.failed} failed · {c.stats.skipped} skipped
                    </span>
                    <Button variant="outline" size="sm" onClick={() => openLogDetail(c.id)}>
                      {logExpandedId === c.id ? "Hide results" : "Results"}
                    </Button>
                  </div>
                  {logExpandedId === c.id && (
                    <div className="rounded-lg border border-[var(--color-border)] p-3">
                      {logLoading[c.id] ? (
                        <p className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-2">
                          <Spinner size="sm" label="" /> Loading results…
                        </p>
                      ) : (
                        <RecipientTable
                          recipients={logDetails[c.id] ?? []}
                          statusFilter={logStatus}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Direct messages ── */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Direct messages
            <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
              one message to one user, sent from the user directory — never part of a campaign
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {directLoading && !directLoadedOnce ? (
            <div className="p-4"><ListSkeleton rows={3} /></div>
          ) : directMessages.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted-foreground)]">
              No direct messages sent yet. Use the Message button on a user to send one.
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--color-border)]">
                {directMessages.map((m) => (
                  <div key={m.id} className="p-4 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-muted)] flex-shrink-0">
                        {m.channel === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{m.userName}</p>
                        <p className="text-xs text-[var(--color-muted-foreground)] truncate">{m.identifier}</p>
                      </div>
                      <Badge className={cn("text-xs capitalize", m.status === "sent" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300")}>
                        {m.status}
                      </Badge>
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        {(m.sentAt ?? m.createdAt) ? new Date(m.sentAt ?? m.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {m.channel === "email"
                        ? <>{m.subject ? <>Subject: {m.subject} · </> : null}{m.body}</>
                        : <>Template: {m.whatsappTemplateName}</>}
                    </p>
                    {m.status === "failed" && m.error && (
                      <p className="text-xs text-red-600 dark:text-red-400">{m.error}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] p-3">
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  Page {directPage} of {directPages} · {directTotal} message{directTotal === 1 ? "" : "s"}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={directPage <= 1 || directLoading}
                    onClick={() => setDirectPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={directPage >= directPages || directLoading}
                    onClick={() => setDirectPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="analytics" className="pt-4">
          <AnalyticsTab stats={stats} />
        </TabsContent>

        <TabsContent value="suppression" className="pt-4">
          <SuppressionTab />
        </TabsContent>
      </Tabs>

      {/* ── Direct-message dialog ── */}
      <DirectMessageDialog
        user={directMessageUser}
        onClose={() => setDirectMessageUser(null)}
        onSent={() => {
          void loadDirectMessages();
          void loadDirectory();
        }}
      />

      {/* ── Campaign detail drawer ── */}
      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) { setDetailId(null); setDetail(null); }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {[...campaigns, ...logCampaigns].find((c) => c.id === detailId)?.name ?? "Campaign results"}
            </SheetTitle>
            <SheetDescription>
              Per-recipient results with delivery tracking.
            </SheetDescription>
          </SheetHeader>
          <div className="pt-4">
            {loadingDetail ? (
              <p className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                <Spinner size="sm" label="" /> Loading results…
              </p>
            ) : detail ? (
              <>
                <RecipientTable recipients={detail.recipients} statusFilter="all" />
                <TrackingNote
                  recipients={detail.recipients}
                  channel={
                    [...campaigns, ...logCampaigns].find((c) => c.id === detailId)?.channel ?? "email"
                  }
                />
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
