"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard, Store, Zap, Loader2, AlertTriangle, CheckCircle2,
  RefreshCw, Plus, User, Bell, Key, ExternalLink, Lock,
  Globe, Clock, Shield, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import { PLAN_DISPLAY, INTERVAL_META, ALL_INTERVALS } from "@/lib/plans";
// planDisplay is passed from the server page but we import PLAN_DISPLAY directly
// for type safety — the two are always the same object.
import type { BillingInterval, PlanKey } from "@/lib/billing";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

// ── Static data ───────────────────────────────────────────────────────────────

const platformIcon: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🔧", etsy: "🧶", csv_manual: "📄",
};

const PLAN_FEATURES: Record<string, string[]> = {
  free:    ["50 orders/month", "1 store", "CSV import"],
  starter: ["100 orders/month", "1 store", "1 ad platform", "2 team members"],
  growth:  ["1,000 orders/month", "2 stores", "3 ad platforms", "AI insights (weekly)", "PDF reports", "5 team members"],
  pro:     ["Unlimited orders", "Unlimited stores", "All ad platforms", "Real-time AI insights", "API access", "Unlimited members"],
};

const TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Toronto", "America/Vancouver",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Istanbul",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Asia/Shanghai", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

const CURRENCIES = [
  "USD","EUR","GBP","CAD","AUD","JPY","SGD","INR","BRL","MXN",
  "CHF","SEK","NOK","DKK","PLN","CZK","HUF","AED","SAR","ZAR",
];

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Small UI helpers ──────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
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

function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: () => void; disabled?: boolean;
}) {
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

// ── Main component ────────────────────────────────────────────────────────────

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

  // ── Billing ───────────────────────────────────────────────────────────────
  const [upgradeInterval, setUpgradeInterval] = useState<BillingInterval>("monthly");
  const [cancelling, setCancelling] = useState(false);

  const {
    openCheckout, loading: checkoutLoading,
    getPrice, getTotalPrice, getCurrency, pricesLoaded,
  } = usePaddleCheckout();

  // ── Store state ───────────────────────────────────────────────────────────
  const [syncingStore, setSyncingStore] = useState<string | null>(null);

  // ── Profile state ─────────────────────────────────────────────────────────
  const [displayName,   setDisplayName]   = useState(data.user.name);
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Workspace state ───────────────────────────────────────────────────────
  const [wsName,          setWsName]          = useState(data.team?.name     ?? "");
  const [wsCurrency,      setWsCurrency]      = useState(data.team?.currency ?? "USD");
  const [wsTimezone,      setWsTimezone]      = useState(data.team?.timezone ?? "UTC");
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  // ── Notifications state ───────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState({
    email_goal_behind: true,
    email_margin_drop: true,
    email_sync_error:  true,
    slack_goal_behind: false,
    slack_margin_drop: false,
  });
  const [slackWebhook,  setSlackWebhook]  = useState("");
  const [testingSlack,  setTestingSlack]  = useState(false);
  const [savingNotifs,  setSavingNotifs]  = useState(false);
  const [notifsLoaded,  setNotifsLoaded]  = useState(false);

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

  const upgrade = async (plan: PlanKey, interval: BillingInterval) => {
    await openCheckout(plan, interval);
  };

  const cancelSubscription = async () => {
    if (!confirm("Cancel subscription? You keep access until the end of your billing period.")) return;
    setCancelling(true); setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (res.ok) {
        setFeedback("ok", "Subscription cancelled. Access continues until period end.");
        router.refresh();
      } else {
        const j = await res.json();
        setFeedback("err", j.error ?? "Cancellation failed.");
      }
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

  // ── Derived values ────────────────────────────────────────────────────────

  const sub        = data.subscription;
  const isTrialing = sub?.status === "trialing";

  const fmtMoney = (n: number, currency = "USD") =>
    new Intl.NumberFormat("en-US", {
      style: "currency", currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile",       label: "Profile" },
    { key: "billing",       label: "Billing & Plan" },
    { key: "stores",        label: "Connected Stores" },
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

      {/* ── PROFILE TAB ──────────────────────────────────────────────────────── */}
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
              <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[var(--color-border)]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Display Name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input defaultValue={data.user.email} type="email" className="h-9" disabled />
                  <p className="text-xs text-[var(--color-muted-foreground)]">Email cannot be changed after registration.</p>
                </div>
                <Button
                  size="sm" className="w-fit gap-2" onClick={saveProfile}
                  disabled={savingProfile || !displayName.trim() || displayName.trim() === data.user.name}
                >
                  {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          {data.team && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" /> Workspace
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Workspace Name</Label>
                  <Input value={wsName} onChange={(e) => setWsName(e.target.value)} className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Currency</Label>
                    <select
                      value={wsCurrency} onChange={(e) => setWsCurrency(e.target.value)}
                      className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Timezone</Label>
                    <select
                      value={wsTimezone} onChange={(e) => setWsTimezone(e.target.value)}
                      className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                    >
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-2" onClick={saveWorkspace} disabled={savingWorkspace}>
                  {savingWorkspace ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save Workspace Settings
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── BILLING TAB ──────────────────────────────────────────────────────── */}
      {tab === "billing" && canManageBilling && (
        <div className="space-y-4 max-w-3xl">

          {/* Current subscription */}
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
                        {formatCurrency(sub.amount / 100, sub.currency)}/
                        {sub.interval === "annual"     ? "yr"  :
                         sub.interval === "semiannual" ? "6mo" :
                         sub.interval === "quarterly"  ? "3mo" : "mo"}
                        {" · "}
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
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />{f}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border)]">
                    {sub.plan !== "pro" && !sub.cancelAtPeriodEnd && (
                      <Button
                        size="sm" className="gap-2"
                        onClick={() => upgrade(sub.plan === "starter" ? "growth" : "pro", upgradeInterval)}
                        disabled={checkoutLoading}
                      >
                        {checkoutLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        Upgrade
                      </Button>
                    )}
                    {!sub.cancelAtPeriodEnd && (
                      <Button
                        variant="outline" size="sm" onClick={cancelSubscription} disabled={cancelling}
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

          {/* Upgrade plan cards — shown when not on Pro */}
          {userPlan !== "pro" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <CardTitle className="text-base">Upgrade Your Plan</CardTitle>

                  {/* ── Billing interval selector ──────────────────────────── */}
                  <div className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-0.5 gap-0.5 sm:ml-auto">
                    {ALL_INTERVALS.map((iv) => {
                      const meta     = INTERVAL_META[iv];
                      const isActive = upgradeInterval === iv;
                      return (
                        <button
                          key={iv}
                          onClick={() => setUpgradeInterval(iv)}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                            isActive
                              ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                          )}
                        >
                          {meta.label}
                          {meta.discountPct > 0 && (
                            <span className={cn(
                              "ml-1 text-[10px] font-bold",
                              isActive ? "text-green-600 dark:text-green-400" : "text-green-500/60"
                            )}>
                              −{meta.discountPct}%
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(["starter", "growth", "pro"] as PlanKey[]).map((plan) => {
                    const isCurrentPlan = userPlan === plan;
                    const isRecommended = plan === "growth";
                    const perMonth      = getPrice(plan, upgradeInterval);
                    const totalCharge   = getTotalPrice(plan, upgradeInterval);
                    const currency      = getCurrency(plan, upgradeInterval);
                    const meta          = INTERVAL_META[upgradeInterval];

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
                          <p className="font-bold capitalize text-[var(--color-foreground)]">
                            {PLAN_DISPLAY[plan].name}
                          </p>

                          {/* Per-month price */}
                          <p className={cn(
                            "text-2xl font-bold text-[var(--color-primary)] mt-1 transition-opacity",
                            !pricesLoaded && "opacity-50"
                          )}>
                            {fmtMoney(perMonth, currency)}
                            <span className="text-sm font-normal text-[var(--color-muted-foreground)]">/mo</span>
                          </p>

                          {/* Billing cadence */}
                          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                            {upgradeInterval === "monthly" ? (
                              "billed monthly"
                            ) : (
                              <>
                                {fmtMoney(totalCharge, currency)} {meta.billedLabel}
                                {meta.discountPct > 0 && (
                                  <span className="ml-1 font-semibold text-green-600 dark:text-green-400">
                                    · save {meta.discountPct}%
                                  </span>
                                )}
                              </>
                            )}
                          </p>
                        </div>

                        {/* Feature list */}
                        <div className="space-y-1.5">
                          {PLAN_FEATURES[plan].map((f) => (
                            <div key={f} className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                              <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />{f}
                            </div>
                          ))}
                        </div>

                        {/* CTA */}
                        {isCurrentPlan ? (
                          <Badge variant="success" className="w-full justify-center text-xs">Current Plan</Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full gap-1.5"
                            variant={isRecommended ? "default" : "outline"}
                            disabled={checkoutLoading}
                            onClick={() => upgrade(plan, upgradeInterval)}
                          >
                            {checkoutLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowRight className="h-3.5 w-3.5" />
                            )}
                            Get {PLAN_DISPLAY[plan].name}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Paddle trust line */}
                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <Shield className="h-3.5 w-3.5" />
                  Payments processed securely via Paddle. Cancel anytime.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── STORES TAB ───────────────────────────────────────────────────────── */}
      {tab === "stores" && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" /> Connected Stores
                </CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push("/onboarding")}>
                  <Plus className="h-3.5 w-3.5" /> Add Store
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.stores.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <Store className="h-10 w-10 mx-auto text-[var(--color-border)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">No stores connected</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Connect a Shopify, WooCommerce, or Etsy store to start syncing orders.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => router.push("/onboarding")} className="gap-2">
                    <Plus className="h-3.5 w-3.5" /> Connect a Store
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.stores.map((store) => (
                    <div
                      key={store.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors"
                    >
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
                            {store.lastSyncAt
                              ? `Last synced ${new Date(store.lastSyncAt).toLocaleDateString()}`
                              : "Never synced"}
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
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => syncStore(store.id)}
                          disabled={syncingStore === store.id || store.syncStatus === "syncing"}
                          title="Sync now"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", syncingStore === store.id && "animate-spin")} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ────────────────────────────────────────────────── */}
      {tab === "notifications" && (
        <div className="space-y-4 max-w-xl">
          {/* Email notifications */}
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
                  <Toggle checked={notifPrefs[key]} onChange={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Slack — Growth/Pro only */}
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
                      />
                      <Button
                        size="sm" variant="outline"
                        disabled={!slackWebhook || testingSlack}
                        onClick={testSlack}
                        className="h-9 gap-1.5 whitespace-nowrap"
                      >
                        {testingSlack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Test
                      </Button>
                    </div>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Create an incoming webhook at{" "}
                      <a
                        href="https://api.slack.com/messaging/webhooks"
                        target="_blank" rel="noopener noreferrer"
                        className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5"
                      >
                        api.slack.com <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </p>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                    <p className="text-xs font-medium text-[var(--color-foreground)]">Slack alert triggers</p>
                    {([
                      { key: "slack_goal_behind", label: "Goal behind pace" },
                      { key: "slack_margin_drop", label: "Margin drop" },
                    ] as const).map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-[var(--color-muted-foreground)]">{label}</span>
                        <Toggle checked={notifPrefs[key]} onChange={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={saveNotifications} disabled={savingNotifs} className="gap-2">
            {savingNotifs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save Notification Preferences
          </Button>

          {/* API Keys shortcut */}
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
        </div>
      )}
    </div>
  );
}
