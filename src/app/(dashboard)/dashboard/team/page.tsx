"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import {
  Users, Plus, Loader2, UserMinus, Shield, Eye,
  Crown, AlertCircle, Send, Clock, CheckCircle2, Lock,
  MoreHorizontal, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import { ViewerBanner } from "@/components/dashboard/RoleGate";

interface Member {
  userId: string;
  name?: string;
  email: string;
  image?: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "pending";
  invitedAt?: string;
  joinedAt?: string;
}

interface InviteForm {
  email: string;
  role: "admin" | "member" | "viewer";
}

const ROLE_META: Record<string, { icon: React.ElementType; color: string; bg: string; desc: string }> = {
  owner:  { icon: Crown,  color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/40", desc: "Full access including billing and API keys." },
  admin:  { icon: Shield, color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-100 dark:bg-blue-900/40",   desc: "Manage stores, orders, COGS, and team members. No billing." },
  member: { icon: Users,  color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/40", desc: "View all data and edit COGS. Cannot manage team or billing." },
  viewer: { icon: Eye,    color: "text-slate-500",                       bg: "bg-slate-100 dark:bg-slate-800",    desc: "Read-only access. Can view dashboards and export reports." },
};

function RoleChip({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? ROLE_META.viewer;
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize", meta.color, meta.bg)}>
      <Icon className="h-3 w-3" />
      {role}
    </span>
  );
}

function MemberAvatar({ name, email }: { name?: string; email: string }) {
  const initials = (name ?? email).slice(0, 2).toUpperCase();
  const colors = ["bg-indigo-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-teal-500", "bg-sky-500"];
  const color = colors[(name ?? email).charCodeAt(0) % colors.length];
  return (
    <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0", color)}>
      {initials}
    </div>
  );
}

export default function TeamPage() {
  const { role: myRole, canManageTeam } = useRole();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<InviteForm>({
    defaultValues: { email: "", role: "member" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/members");
      const j = await res.json();
      setMembers(j.members ?? []);
    } catch {
      setError("Failed to load team members.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onInvite = async (data: InviteForm) => {
    setInviting(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Invite failed."); return; }
      setSuccess(`Invite sent to ${data.email}`);
      reset(); setShowInvite(false); await load();
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    setChangingRoleId(userId);
    try {
      const res = await fetch("/api/team/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Role change failed.");
        return;
      }
      await load();
    } finally {
      setChangingRoleId(null);
    }
  };

  const removeMember = async (userId: string, email: string) => {
    if (!confirm(`Remove ${email} from your team? They will lose access immediately.`)) return;
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/team/members?userId=${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Remove failed.");
        return;
      }
      setSuccess(`${email} has been removed.`);
      await load();
    } finally {
      setRemovingId(null);
    }
  };

  const activeMembers  = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Team</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {loading ? "…" : `${activeMembers.length} active${pendingMembers.length > 0 ? ` · ${pendingMembers.length} pending` : ""}`}
            </p>
          </div>
        </div>
        {canManageTeam && (
          <Button
            onClick={() => { setShowInvite((v) => !v); setError(null); setSuccess(null); }}
            className="gap-2"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Viewer/member read-only notice */}
      {!canManageTeam && (
        <ViewerBanner message="You can view team members but cannot invite or modify roles. Contact the owner or an admin to make changes." />
      )}

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
          <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />{success}
          <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}

      {/* Invite form — owner/admin only */}
      {showInvite && canManageTeam && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-[var(--color-primary)]" />
              Invite a Team Member
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit(onInvite)} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="teammate@company.com"
                  {...register("email", { required: "Email required" })}
                  className="h-9"
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div className="w-44 space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select defaultValue="member" onValueChange={(v) => setValue("role", v as "admin" | "member" | "viewer")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Only owner can invite admins */}
                    {myRole === "owner" && <SelectItem value="admin">Admin</SelectItem>}
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting} className="gap-2 h-9 flex-shrink-0">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Invite
              </Button>
            </form>

            {/* Role explanation cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {(myRole === "owner" ? ["admin", "member", "viewer"] : ["member", "viewer"]).map((r) => {
                const meta = ROLE_META[r];
                const Icon = meta.icon;
                return (
                  <div key={r} className={cn("text-xs rounded-lg border border-[var(--color-border)] p-3", meta.bg)}>
                    <div className={cn("flex items-center gap-1.5 mb-1 font-semibold capitalize", meta.color)}>
                      <Icon className="h-3.5 w-3.5" /> {r}
                    </div>
                    <p className="text-[var(--color-muted-foreground)] leading-relaxed">{meta.desc}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      <Card>
        <CardHeader className="pb-0 px-0 pt-0">
          {/* empty intentional — table handles its own header */}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-[var(--color-border)]">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-9 w-9 rounded-full bg-[var(--color-muted)] animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-32 rounded bg-[var(--color-muted)] animate-pulse" />
                    <div className="h-3 w-44 rounded bg-[var(--color-muted)] animate-pulse" />
                  </div>
                  <div className="h-6 w-16 rounded-full bg-[var(--color-muted)] animate-pulse" />
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 mx-auto text-[var(--color-border)] mb-3" />
              <p className="text-sm font-medium text-[var(--color-foreground)]">No team members yet</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Invite teammates to collaborate on your profit data.</p>
            </div>
          ) : (
            <div>
              {/* Active members */}
              {activeMembers.length > 0 && (
                <div>
                  <div className="px-5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">
                      Active · {activeMembers.length}
                    </p>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {activeMembers.map((m) => (
                      <MemberRow
                        key={m.userId}
                        member={m}
                        myRole={myRole}
                        canManageTeam={canManageTeam}
                        isChangingRole={changingRoleId === m.userId}
                        isRemoving={removingId === m.userId}
                        onChangeRole={changeRole}
                        onRemove={removeMember}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Pending invites */}
              {pendingMembers.length > 0 && (
                <div>
                  <div className="px-5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">
                      Pending Invites · {pendingMembers.length}
                    </p>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {pendingMembers.map((m) => (
                      <MemberRow
                        key={m.userId}
                        member={m}
                        myRole={myRole}
                        canManageTeam={canManageTeam}
                        isChangingRole={false}
                        isRemoving={removingId === m.userId}
                        onChangeRole={changeRole}
                        onRemove={removeMember}
                        isPending
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions matrix — informational, shown to all */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Permission Matrix</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">Permission</th>
                  {["Owner", "Admin", "Member", "Viewer"].map((r) => (
                    <th key={r} className="px-4 py-3 text-center text-xs font-semibold text-[var(--color-muted-foreground)]">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[
                  { label: "View dashboards & reports",          owner: true,  admin: true,  member: true,  viewer: true  },
                  { label: "Export CSV reports",                  owner: true,  admin: true,  member: true,  viewer: true  },
                  { label: "Edit COGS",                           owner: true,  admin: true,  member: true,  viewer: false },
                  { label: "Import orders (CSV)",                 owner: true,  admin: true,  member: true,  viewer: false },
                  { label: "Manage stores & sync",                owner: true,  admin: true,  member: false, viewer: false },
                  { label: "Invite & manage team members",        owner: true,  admin: true,  member: false, viewer: false },
                  { label: "Create & manage goals",               owner: true,  admin: true,  member: false, viewer: false },
                  { label: "Manage billing & subscription",       owner: true,  admin: false, member: false, viewer: false },
                  { label: "Generate API keys",                   owner: true,  admin: false, member: false, viewer: false },
                  { label: "View audit log",                      owner: true,  admin: false, member: false, viewer: false },
                ].map(({ label, ...perms }) => (
                  <tr key={label} className="hover:bg-[var(--color-muted)]/40">
                    <td className="px-5 py-2.5 text-[var(--color-foreground)]">{label}</td>
                    {(["owner", "admin", "member", "viewer"] as const).map((r) => (
                      <td key={r} className="px-4 py-2.5 text-center">
                        {perms[r]
                          ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          : <span className="text-[var(--color-border)] text-lg leading-none mx-auto block">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Extracted member row to keep main component clean ─────────────────────────

function MemberRow({
  member: m,
  myRole,
  canManageTeam,
  isChangingRole,
  isRemoving,
  onChangeRole,
  onRemove,
  isPending = false,
}: {
  member: Member;
  myRole: string;
  canManageTeam: boolean;
  isChangingRole: boolean;
  isRemoving: boolean;
  onChangeRole: (id: string, role: string) => void;
  onRemove: (id: string, email: string) => void;
  isPending?: boolean;
}) {
  const isOwner = m.role === "owner";
  const canModify = canManageTeam && !isOwner && !(myRole === "admin" && m.role === "admin");

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--color-muted)]/40 transition-colors">
      <div className="relative flex-shrink-0">
        <MemberAvatar name={m.name} email={m.email} />
        {isPending && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-400 border border-[var(--color-card)]">
            <Clock className="h-2 w-2 text-white" />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
          {m.name ?? m.email}
          {m.name && <span className="text-[var(--color-muted-foreground)] font-normal"> · {m.email}</span>}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {isPending
            ? `Invite sent ${m.invitedAt ? new Date(m.invitedAt).toLocaleDateString() : ""}`
            : `Joined ${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}`}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <RoleChip role={m.role} />

        {canModify ? (
          <div className="flex items-center gap-1">
            {isChangingRole ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted-foreground)]" />
            ) : (
              <Select
                defaultValue={m.role}
                onValueChange={(v) => onChangeRole(m.userId, v)}
              >
                <SelectTrigger className="h-7 w-28 text-xs border-[var(--color-border)]">
                  <SelectValue />
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </SelectTrigger>
                <SelectContent>
                  {myRole === "owner" && <SelectItem value="admin">Admin</SelectItem>}
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(m.userId, m.email)}
              disabled={isRemoving}
              className="h-7 w-7 p-0 text-[var(--color-muted-foreground)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              aria-label={`Remove ${m.email}`}
            >
              {isRemoving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <UserMinus className="h-3.5 w-3.5" />
              }
            </Button>
          </div>
        ) : isOwner ? null : (
          <div className="flex h-7 w-7 items-center justify-center text-[var(--color-border)]" title="You cannot modify this member">
            <Lock className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
