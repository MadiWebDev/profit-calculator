"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList, ChevronLeft, ChevronRight, Filter,
  User, Store, Package, ShoppingCart, CreditCard,
  Key, Settings, Target, FileText, LogIn, UserPlus,
  Shield, AlertCircle, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  action: string;
  description: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

interface AuditData {
  logs: LogEntry[];
  total: number;
  pages: number;
  page: number;
}

// Map action → icon + color + category label
const ACTION_META: Record<string, { icon: React.ElementType; color: string; category: string }> = {
  "user.login":               { icon: LogIn,       color: "text-blue-500",   category: "Auth" },
  "user.logout":              { icon: LogIn,       color: "text-slate-400",  category: "Auth" },
  "user.invited":             { icon: UserPlus,    color: "text-violet-500", category: "Team" },
  "user.role_changed":        { icon: Shield,      color: "text-yellow-500", category: "Team" },
  "user.removed":             { icon: User,        color: "text-red-500",    category: "Team" },
  "store.connected":          { icon: Store,       color: "text-green-500",  category: "Store" },
  "store.disconnected":       { icon: Store,       color: "text-red-500",    category: "Store" },
  "product.cogs_updated":     { icon: Package,     color: "text-orange-500", category: "Product" },
  "order.imported":           { icon: ShoppingCart,color: "text-blue-500",   category: "Orders" },
  "subscription.created":     { icon: CreditCard,  color: "text-green-500",  category: "Billing" },
  "subscription.cancelled":   { icon: CreditCard,  color: "text-red-500",    category: "Billing" },
  "subscription.upgraded":    { icon: CreditCard,  color: "text-violet-500", category: "Billing" },
  "goal.created":             { icon: Target,      color: "text-blue-500",   category: "Goals" },
  "goal.updated":             { icon: Target,      color: "text-yellow-500", category: "Goals" },
  "report.exported":          { icon: FileText,    color: "text-slate-500",  category: "Reports" },
  "settings.updated":         { icon: Settings,    color: "text-slate-500",  category: "Settings" },
  "api_key.created":          { icon: Key,         color: "text-green-500",  category: "API" },
  "api_key.revoked":          { icon: Key,         color: "text-red-500",    category: "API" },
};

const CATEGORY_COLORS: Record<string, string> = {
  Auth:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Team:     "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Store:    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  Product:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Orders:   "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Billing:  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  Goals:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  Reports:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Settings: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  API:      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const secs = Math.floor((now - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function UserBubble({ user }: { user: { name: string; email: string } | null }) {
  if (!user) return <span className="text-[var(--color-muted-foreground)]">System</span>;
  const initials = user.name.slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-[10px] font-bold flex-shrink-0">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--color-foreground)] truncate leading-tight">{user.name}</p>
        <p className="text-[10px] text-[var(--color-muted-foreground)] truncate leading-tight">{user.email}</p>
      </div>
    </div>
  );
}

const ALL_ACTIONS = Object.keys(ACTION_META);

export function AuditLogClient({ data }: { data: AuditData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [actionFilter, setActionFilter] = useState(searchParams.get("action") ?? "");

  const applyFilter = (action: string) => {
    setActionFilter(action);
    const p = new URLSearchParams();
    if (action) p.set("action", action);
    p.set("page", "1");
    startTransition(() => router.push(`/dashboard/settings/audit-log?${p.toString()}`));
  };

  const goPage = (pg: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(pg));
    startTransition(() => router.push(`/dashboard/settings/audit-log?${p.toString()}`));
  };

  const exportCSV = () => {
    const headers = ["Timestamp", "Action", "Description", "User", "Email", "IP Address"];
    const rows = data.logs.map((l) => [
      fullDateTime(l.createdAt),
      l.action,
      l.description,
      l.user?.name ?? "System",
      l.user?.email ?? "",
      l.ipAddress ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Audit Log</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              All workspace actions · {data.total.toLocaleString()} events · retained 1 year
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-[var(--color-muted-foreground)] flex-shrink-0" />
        <Select value={actionFilter || "all"} onValueChange={(v) => applyFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-56 text-sm">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ALL_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {actionFilter && (
          <Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => applyFilter("")}>
            Clear filter
          </Button>
        )}
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">
          Page {data.page} of {data.pages}
        </span>
      </div>

      {/* Log table */}
      <Card>
        <CardContent className="p-0">
          {data.logs.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <ClipboardList className="h-10 w-10 mx-auto text-[var(--color-border)]" />
              <p className="text-sm font-medium text-[var(--color-foreground)]">No audit events found</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {actionFilter ? "Try clearing the filter." : "Events will appear here as your team takes actions."}
              </p>
            </div>
          ) : (
            <div className={cn("divide-y divide-[var(--color-border)]", isPending && "opacity-60 pointer-events-none")}>
              {data.logs.map((log) => {
                const meta = ACTION_META[log.action] ?? { icon: AlertCircle, color: "text-slate-400", category: "Other" };
                const Icon = meta.icon;
                return (
                  <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-[var(--color-muted)]/40 transition-colors">
                    {/* Icon */}
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-muted)] flex-shrink-0 mt-0.5",
                    )}>
                      <Icon className={cn("h-4 w-4", meta.color)} />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", CATEGORY_COLORS[meta.category] ?? "bg-[var(--color-muted)]")}>
                          {meta.category}
                        </span>
                        <code className="text-xs font-mono text-[var(--color-muted-foreground)]">{log.action}</code>
                      </div>
                      <p className="text-sm text-[var(--color-foreground)] leading-snug">{log.description}</p>
                      {log.ipAddress && (
                        <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">IP: {log.ipAddress}</p>
                      )}
                    </div>

                    {/* User */}
                    <div className="hidden sm:flex flex-shrink-0 w-44">
                      <UserBubble user={log.user} />
                    </div>

                    {/* Timestamp */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-[var(--color-muted-foreground)]" title={fullDateTime(log.createdAt)}>
                        {timeLabel(log.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--color-muted-foreground)]">
          <p>{data.total.toLocaleString()} total events</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => goPage(data.page - 1)}
              disabled={data.page <= 1 || isPending}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs px-2">
              {data.page} / {data.pages}
            </span>
            <Button
              variant="outline" size="sm"
              onClick={() => goPage(data.page + 1)}
              disabled={data.page >= data.pages || isPending}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Retention note */}
      <p className="text-xs text-[var(--color-muted-foreground)] text-center">
        Audit logs are automatically deleted after 1 year per your data retention policy.
      </p>
    </div>
  );
}
