"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Loader2, Crown, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "superAdmin" | "owner";
  plan: "free" | "starter" | "growth" | "pro";
  onboardingCompleted: boolean;
  createdAt: string;
  trialEndsAt: string | null;
  teamPlan: string | null;
  hasSubscription: boolean;
}

interface ApiResponse {
  users: UserRow[];
  total: number;
  page: number;
  pages: number;
  stats: Record<string, number>;
}

const PLAN_COLORS: Record<string, string> = {
  free:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  growth:  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  pro:     "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

function UserAvatar({ name, email }: { name: string; email: string }) {
  const colors = ["bg-indigo-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-teal-500"];
  const color  = colors[email.charCodeAt(0) % colors.length];
  return (
    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0", color)}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function UsersClient() {
  const [data,    setData]    = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [plan,    setPlan]    = useState("");
  const [page,    setPage]    = useState(1);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      if (plan)   params.set("plan", plan);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [page, search, plan]);

  useEffect(() => { load(); }, [load]);

  const updateUser = async (userId: string, field: "role" | "plan", value: string) => {
    setUpdating(userId); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, [field]: value }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Update failed"); return; }
      setSuccess(`Updated ${field} for user.`);
      await load();
    } finally {
      setUpdating(null);
    }
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const stats = data?.stats ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Users</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
          {total.toLocaleString()} total users
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["free", "starter", "growth", "pro"] as const).map((p) => (
          <button
            key={p}
            onClick={() => { setPlan(plan === p ? "" : p); setPage(1); }}
            className={cn(
              "rounded-xl px-4 py-3 text-left transition-all border",
              plan === p
                ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40",
              PLAN_COLORS[p]
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide capitalize">{p}</p>
            <p className="text-xl font-bold mt-0.5">{stats[p] ?? 0}</p>
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
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9"
              />
            </div>
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
          ) : users.length === 0 ? (
            <div className="py-14 text-center text-sm text-[var(--color-muted-foreground)]">
              No users found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    {["User", "Role", "Plan", "Subscription", "Onboarded", "Joined", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[var(--color-muted)]/40 transition-colors">
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={u.name} email={u.email} />
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--color-foreground)] truncate max-w-[160px]">{u.name}</p>
                            <p className="text-xs text-[var(--color-muted-foreground)] truncate max-w-[160px]">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full",
                          u.role === "superAdmin"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                        )}>
                          <Crown className="h-3 w-3" />
                          {u.role === "superAdmin" ? "Super Admin" : "Owner"}
                        </span>
                      </td>

                      {/* Plan badge */}
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", PLAN_COLORS[u.plan])}>
                          {u.plan}
                        </span>
                      </td>

                      {/* Subscription */}
                      <td className="px-4 py-3">
                        {u.hasSubscription
                          ? <Badge variant="success" className="text-xs">Paid</Badge>
                          : u.trialEndsAt
                          ? <Badge variant="warning" className="text-xs">Trial</Badge>
                          : <Badge variant="outline"  className="text-xs">Free</Badge>
                        }
                      </td>

                      {/* Onboarded */}
                      <td className="px-4 py-3">
                        {u.onboardingCompleted
                          ? <span className="text-green-600 dark:text-green-400 text-xs font-medium">Yes</span>
                          : <span className="text-[var(--color-muted-foreground)] text-xs">No</span>
                        }
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {updating === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted-foreground)]" />
                          ) : (
                            <>
                              {/* Change plan */}
                              <Select
                                value={u.plan}
                                onValueChange={(v) => updateUser(u.id, "plan", v)}
                              >
                                <SelectTrigger className="h-7 w-28 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">Free</SelectItem>
                                  <SelectItem value="starter">Starter</SelectItem>
                                  <SelectItem value="growth">Growth</SelectItem>
                                  <SelectItem value="pro">Pro</SelectItem>
                                </SelectContent>
                              </Select>

                              {/* Toggle superAdmin */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "h-7 text-xs px-2",
                                  u.role === "superAdmin"
                                    ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                                )}
                                onClick={() => updateUser(u.id, "role", u.role === "superAdmin" ? "owner" : "superAdmin")}
                                title={u.role === "superAdmin" ? "Remove superAdmin" : "Make superAdmin"}
                              >
                                {u.role === "superAdmin" ? "Demote" : "Make Admin"}
                              </Button>
                            </>
                          )}
                        </div>
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
                Page {page} of {pages} · {total} users
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
