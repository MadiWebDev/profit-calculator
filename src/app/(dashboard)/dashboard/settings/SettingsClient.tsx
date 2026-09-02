"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard, Store, Zap, Loader2, AlertTriangle, CheckCircle2,
  RefreshCw, Plus, User, Bell, Key, ExternalLink, Lock,
  Globe, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import { ViewerBanner } from "@/components/dashboard/RoleGate";
import type { PLAN_DISPLAY } from "@/lib/plans";

const platformIcon: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🔧", etsy: "🧶", csv_manual: "📄",
};

const PLAN_FEATURES: Record<string, string[]> = {
  free:    ["50 orders/month", "1 store", "CSV import", "1 team member"],
  starter: ["100 orders/month", "1 store", "1 ad platform", "2 team members"],
  growth:  ["1,000 orders/month", "2 stores", "3 ad platforms", "AI insights (weekly)", "PDF reports", "5 team members"],
  pro:     ["Unlimited orders", "Unlimited stores", "All ad platforms", "Real-time AI insights", "API access", "Unlimited team"],
};

// Common IANA timezones for the dropdown
const TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Toronto", "America/Vancouver",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Istanbul",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Asia/Shanghai", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

const CURRENCIES = ["USD","EUR","GBP","CAD","AUD","JPY","SGD","INR","BRL","MXN","CHF","SEK","NOK","DKK","PLN","CZK","HUF","AED","SAR","ZAR"];

interface SettingsData {
  team: { name: string; plan: string; currency: string; timezone: string } | null;
  subscription: {
    plan: string; status: string; interval: string;
    currentPeriodEnd?: string; cancelAtPeriodEnd: boolean;
    amount: number; currency: string; trialEndsAt?: string;
  } | null;
  stores: {
    id: string; name: string; platform: string;
    syncStatus: string; lastSyncAt?: string; ordersCount: number; domain?: string;
  }[];
  planDisplay: typeof PLAN_DISPLAY;
  user: { name: string; email: string; image?: string };
}

type Tab = "profile" | "billing" | "stores" | "notifications";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
        active
          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  );
}

export function SettingsClient({
  data,
  userPlan,
}: {
  data: SettingsData;
  userPlan: string;
}) {
  const router = useRouter();
  const { role, canManageBilling } = useRole();

  const defaultTab: Tab = canManageBilling ? "billing" : "profile";
  const [tab, setTab] = useState<Tab>(defaultTab);

  // ── Billing state ─────────────────────────────────────────────────────────
  const [upgrading, setUpgrading]   = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ── Store state ───────────────────────────────────────────────────────────
  const [syncingStore, setSyncingStore] = useState<string | null>(null);

  // ── Profile state ─────────────────────────────────────────────────────────
  const [displayName, setDisplayName]   = useState(data.user.name);
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Workspace state ───────────────────────────────────────────────────────
  const [wsName,     setWsName]     = useState(data.team?.name     ?? "");
  const [wsCurrency, setWsCurrency] = useState(data.team?.currency ?? "USD");
  const [wsTimezone, setWsTimezone] = useState(data.team?.timezone ?? "UTC");
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  // ── Notifications state ───────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState({
    email_goal_behind: true,
    email_margin_drop: true,
    email_sync_error:  true,
    slack_goal_behind: false,
    slack_margin_drop: false,
  });
  const [slackWebhook,   setSlackWebhook]   = useState("");
  const [testingSlack,   setTestingSlack]   = useState(false);
  const [savingNotifs,   setSavingNotifs]   = useState(false);
  const [notifsLoaded,   setNotifsLoaded]   = useState(false);

  // ── Global feedback ───────────────────────────────────────────────────────
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setFeedback = (type: "ok" | "err", msg: string) => {
    if (type === "ok") { setSuccess(msg); setError(null); }
    else               { setError(msg);   setSuccess(null); }
    setTimeout(() => { setSuccess(null); setError(null); }, 5000);
  };

  // Load notification prefs when tab becomes active
  useEffect(() => {
    if (tab !== "notifications" || notifsLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/settings/notifications");
        if (res.ok) {
          const j = await res.json();
          setNotifPrefs({
            email_goal_behind: j.email_goal_behind ?? true,
            email_margin_drop: j.email_margin_drop ?? true,
            email_sync_error:  j.email_sync_error  ?? true,
            slack_goal_behind: j.slack_goal_behind ?? false,
            slack_margin_drop: j.slack_margin_drop ?? false,
          });
          setSlackWebhook(j.slackWebhookUrl ?? "");
          setNotifsLoaded(true);
        }
      } catch { /* non-fatal */ }
    })();
  }, [tab, notifsLoaded]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const saveProfile = async () => {
    if (!displayName.trim()) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      if (res.ok) { setFeedback("ok", "Profile updated."); router.refresh(); }
      else { const j = await res.json(); setFeedback("err", j.error ?? "Save failed."); }
    } finally { setSavingProfile(false); }
  };

  const saveWorkspace = async () => {
    setSavingWorkspace(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wsName.trim(), currency: wsCurrency, timezone: wsTimezone }),
      });
      if (res.ok) { setFeedback("ok", "Workspace settings saved."); router.refresh(); }
      else { const j = await res.json(); setFeedback("err", j.error ?? "Save failed."); }
    } finally { setSavingWorkspace(false); }
  };

  const saveNotifications = async () => {
    setSavingNotifs(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...notifPrefs, slackWebhookUrl: slackWebhook }),
      });
      if (res.ok) setFeedback("ok", "Notification preferences saved.");
      else { const j = await res.json(); setFeedback("err", j.error ?? "Save failed."); }
    } finally { setSavingNotifs(false); }
  };

  const upgrade = async (plan: "starter" | "growth" | "pro", interval: "monthly" | "annual") => {
    setUpgrading(true); setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else setFeedback("err", json.error ?? "Checkout failed. Please try again.");
    } finally { setUpgrading(false); }
  };

  const cancelSubscription = async () => {
    if (!confirm("Cancel subscription? You keep access until the end of your billing period.")) return;
    setCancelling(true); setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (res.ok) { setFeedback("ok", "Subscription cancelled. Access continues until period end."); router.refresh(); }
      else { const j = await res.json(); setFeedback("err", j.error ?? "Cancellation failed."); }
    } finally { setCancelling(false); }
  };

  const syncStore = async (storeId: string) => {
    setSyncingStore(storeId);
    try {
      await fetch(`/api/stores/${storeId}/sync`, { method: "POST" });
      router.refresh();
    } finally { setSyncingStore(null); }
  };

  const testSlack = async () => {
    if (!slackWebhook) return;
    setTestingSlack(true);
    try {
      const res = await fetch("/api/notifications/slack-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: slackWebhook }),
      });
      if (res.ok) setFeedback("ok", "Slack test message sent!");
      else setFeedback("err", "Failed to send Slack test.");
    } finally { setTestingSlack(false); }
  };

  const sub       = data.subscription;
  const isTrialing = sub?.status === "trialing";

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile",       label: "Profile" },
    ...(canManageBilling   ? [{ key: "billing"       as Tab, label: "Billing & Plan" }] : []),
    ...(role !== "viewer"  ? [{ key: "stores"        as Tab, label: "Connected Stores" }] : []),
    { key: "notifications", label: "Notifications" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Settings</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
          Manage your account, billing, and workspace preferences.
        </p>
      </div>

      <ViewerBanner message="You have read-only access to settings. Contact the workspace owner to make changes." />

      {/* Alert banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
          <button className="ml-auto" onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />{success}
          <button className="ml-auto" onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] pb-0 -mb-2 overflow-x-auto">
        {tabs.map((t) => (
          <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </TabButton>
        ))}
      </div>

      {/* ── PROFILE TAB ─────────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="space-y-4 max-w-xl">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Your Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-xl font-bold flex-shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-[var(--color-foreground)]">{displayName}</p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">{data.user.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className="text-xs capitalize">{role}</Badge>
                    <Badge variant={userPlan === "pro" ? "default" : "outline"} className="text-xs capitalize">
                      {userPlan} plan
                    </Badge>
                  </div>
                </div>
              </div>
              {role !== "viewer" && (
                <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[var(--color-border)]">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input defaultValue={data.user.email} type="email" className="h-9" disabled />
                    <p className="text-xs text-[var(--color-muted-foreground)]">Email cannot be changed after registration.</p>
                  </div>
                  <Button
                    size="sm"
                    className="w-fit gap-2"
                    onClick={saveProfile}
                    disabled={savingProfile || !displayName.trim() || displayName.trim() === data.user.name}
                  >
                    {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Save Changes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workspace info */}
          {data.team && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" /> Workspace
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(role === "owner" || role === "admin") ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Workspace Name</Label>
                      <Input value={wsName} onChange={(e) => setWsName(e.target.value)} className="h-9" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Globe className="h-3 w-3" /> Currency
                        </Label>
                        <select
                          value={wsCurrency}
                          onChange={(e) => setWsCurrency(e.target.value)}
                          className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                        >
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Timezone
                        </Label>
                        <select
                          value={wsTimezone}
                          onChange={(e) => setWsTimezone(e.target.value)}
                          className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                        >
                          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={saveWorkspace}
                      disabled={savingWorkspace}
                    >
                      {savingWorkspace ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Save Workspace Settings
                    </Button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[var(--color-muted-foreground)] mb-0.5 text-xs">Name</p>
                      <p className="font-medium text-[var(--color-foreground)]">{data.team.name}</p>
                    </div>
                    <div>
                      <p className="text-[var(--color-muted-foreground)] mb-0.5 text-xs">Currency</p>
                      <p className="font-medium text-[var(--color-foreground)]">{data.team.currency}</p>
                    </div>
                    <div>
                      <p className="text-[var(--color-muted-foreground)] mb-0.5 text-xs">Timezone</p>
                      <p className="font-medium text-[var(--color-foreground)]">{data.team.timezone}</p>
                    </div>
                    <div>
                      <p className="text-[var(--color-muted-foreground)] mb-0.5 text-xs">Plan</p>
                      <p className="font-medium text-[var(--color-foreground)] capitalize">{data.team.plan}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── BILLING TAB ─────────────────────────────────────────────────────── */}
      {tab === "billing" && canManageBilling && (
        <div className="space-y-4 max-w-3xl">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sub ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-muted)] border border-[var(--color-border)]">
                    <div>
                      <p className="font-bold text-[var(--color-foreground)] capitalize text-lg">{sub.plan} Plan</p>
                      <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                        {formatCurrency(sub.amount / 100, sub.currency)}/{sub.interval === "annual" ? "yr" : "mo"} ·{" "}
                        {sub.cancelAtPeriodEnd
                          ? `Cancels ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : ""}`
                          : isTrialing
                          ? `Trial ends ${sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : ""}`
                          : `Renews ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : ""}`}
                      </p>
                    </div>
                    <Badge
                      variant={sub.status === "active" ? "success" : sub.status === "trialing" ? "warning" : "outline"}
                      className="capitalize text-xs"
                    >
                      {sub.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(PLAN_FEATURES[sub.plan] ?? []).map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border)]">
                    {sub.plan !== "pro" && (
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => upgrade(sub.plan === "starter" ? "growth" : "pro", "monthly")}
                        disabled={upgrading}
                      >
                        {upgrading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        Upgrade
                      </Button>
                    )}
                    {!sub.cancelAtPeriodEnd && (
                      <Button
                        variant="outline" size="sm"
                        onClick={cancelSubscription} disabled={cancelling}
                        className="text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950 gap-2"
                      >
                        {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Cancel Subscription
                      </Button>
                    )}
                    {sub.cancelAtPeriodEnd && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        Your plan was cancelled. Access ends{" "}
                        {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : ""}.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 text-sm text-yellow-700 dark:text-yellow-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  You&apos;re on the Free plan with limited features.
                </div>
              )}
            </CardContent>
          </Card>

          {userPlan !== "pro" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Upgrade Your Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(["starter", "growth", "pro"] as const).map((plan) => {
                    const isCurrentPlan = userPlan === plan;
                    const isRecommended = plan === "growth";
                    return (
                      <div
                        key={plan}
                        className={cn(
                          "relative rounded-xl border p-5 space-y-4 transition-all",
                          isRecommended ? "border-[var(--color-primary)] shadow-sm" : "border-[var(--color-border)]",
                          isCurrentPlan && "opacity-60"
                        )}
                      >
                        {isRecommended && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <span className="bg-[var(--color-primary)] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                              Most Popular
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-bold capitalize text-[var(--color-foreground)]">{plan}</p>
                          <p className="text-2xl font-bold text-[var(--color-primary)] mt-1">
                            ${data.planDisplay[plan].price}
                            <span className="text-sm font-normal text-[var(--color-muted-foreground)]">/mo</span>
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            ${data.planDisplay[plan].annualPrice}/mo billed annually
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          {PLAN_FEATURES[plan].map((f) => (
                            <div key={f} className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                              <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                              {f}
                            </div>
                          ))}
                        </div>
                        {!isCurrentPlan && (
                          <div className="space-y-2">
                            <Button size="sm" className="w-full gap-1.5" onClick={() => upgrade(plan, "monthly")} disabled={upgrading} variant={isRecommended ? "default" : "outline"}>
                              {upgrading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                              Monthly
                            </Button>
                            <Button size="sm" variant="ghost" className="w-full text-xs gap-1 text-[var(--color-muted-foreground)]" onClick={() => upgrade(plan, "annual")} disabled={upgrading}>
                              Annual — save 20%
                            </Button>
                          </div>
                        )}
                        {isCurrentPlan && (
                          <Badge variant="success" className="w-full justify-center text-xs">Current Plan</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── STORES TAB ──────────────────────────────────────────────────────── */}
      {tab === "stores" && role !== "viewer" && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" /> Connected Stores
                </CardTitle>
                {(role === "owner" || role === "admin") && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push("/onboarding")}>
                    <Plus className="h-3.5 w-3.5" /> Add Store
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {data.stores.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <Store className="h-10 w-10 mx-auto text-[var(--color-border)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">No stores connected</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">Connect a Shopify, WooCommerce, or Etsy store to start syncing orders.</p>
                  </div>
                  <Button size="sm" onClick={() => router.push("/onboarding")} className="gap-2">
                    <Plus className="h-3.5 w-3.5" /> Connect a Store
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.stores.map((store) => (
                    <div key={store.id} className="flex items-center justify-between p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{platformIcon[store.platform] ?? "🏪"}</span>
                        <div>
                          <p className="font-medium text-sm text-[var(--color-foreground)]">{store.name}</p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            <span className="capitalize">{store.platform.replace("_", " ")}</span>
                            {store.domain && ` · ${store.domain}`}
                            {" · "}{store.ordersCount.toLocaleString()} orders
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {store.lastSyncAt ? `Last synced ${new Date(store.lastSyncAt).toLocaleDateString()}` : "Never synced"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            store.syncStatus === "idle"    ? "success"     :
                            store.syncStatus === "syncing" ? "outline"     :
                            store.syncStatus === "error"   ? "destructive" : "outline"
                          }
                          className="text-xs capitalize"
                        >
                          {store.syncStatus === "syncing" ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Syncing
                            </span>
                          ) : store.syncStatus}
                        </Badge>
                        {(role === "owner" || role === "admin") && (
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={() => syncStore(store.id)}
                            disabled={syncingStore === store.id || store.syncStatus === "syncing"}
                            title="Sync now"
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", syncingStore === store.id && "animate-spin")} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ───────────────────────────────────────────────── */}
      {tab === "notifications" && (
        <div className="space-y-4 max-w-xl">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> Email Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                { key: "email_goal_behind", label: "Goal behind pace", desc: "Alert when monthly profit goal falls below threshold" },
                { key: "email_margin_drop", label: "Margin drop",       desc: "Alert when net margin drops more than 5 points" },
                { key: "email_sync_error",  label: "Sync errors",        desc: "Alert when a store sync fails" },
              ] as const).map(({ key, label, desc }) => (
                <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-[var(--color-border)] last:border-0">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{label}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">{desc}</p>
                  </div>
                  <Toggle
                    checked={notifPrefs[key]}
                    onChange={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                    disabled={role === "viewer"}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Slack integration — growth/pro only */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> Slack Notifications
                {!["growth", "pro"].includes(userPlan) && (
                  <Badge variant="outline" className="ml-auto text-xs text-[var(--color-muted-foreground)]">
                    <Lock className="h-3 w-3 mr-1" /> Growth+
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!["growth", "pro"].includes(userPlan) ? (
                <div className="text-center py-6 space-y-2">
                  <Lock className="h-8 w-8 mx-auto text-[var(--color-border)]" />
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Slack notifications require the Growth plan or higher.
                  </p>
                  {canManageBilling && (
                    <Button size="sm" variant="outline" onClick={() => setTab("billing")}>Upgrade →</Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Slack Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://hooks.slack.com/services/..."
                        value={slackWebhook}
                        onChange={(e) => setSlackWebhook(e.target.value)}
                        className="h-9 font-mono text-xs"
                        disabled={role === "viewer"}
                      />
                      <Button
                        size="sm" variant="outline"
                        disabled={!slackWebhook || testingSlack || role === "viewer"}
                        onClick={testSlack}
                        className="h-9 gap-1.5 whitespace-nowrap"
                      >
                        {testingSlack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Test
                      </Button>
                    </div>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Create an incoming webhook at{" "}
                      <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer"
                        className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5">
                        api.slack.com <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </p>
                  </div>

                  {role !== "viewer" && (
                    <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                      <p className="text-xs font-medium text-[var(--color-foreground)]">Slack alert triggers</p>
                      {([
                        { key: "slack_goal_behind", label: "Goal behind pace" },
                        { key: "slack_margin_drop", label: "Margin drop" },
                      ] as const).map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-[var(--color-muted-foreground)]">{label}</span>
                          <Toggle
                            checked={notifPrefs[key]}
                            onChange={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save button — applies to both email prefs and Slack config */}
          {role !== "viewer" && (
            <Button onClick={saveNotifications} disabled={savingNotifs} className="gap-2">
              {savingNotifs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save Notification Preferences
            </Button>
          )}

          {/* API Keys shortcut — owner only */}
          {role === "owner" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="h-4 w-4" /> API Access
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--color-muted-foreground)] mb-3">
                  Generate API keys to access your data programmatically.
                  {userPlan !== "pro" && " Requires Pro plan."}
                </p>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => router.push("/dashboard/settings/api-keys")}>
                  <Key className="h-3.5 w-3.5" /> Manage API Keys
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
