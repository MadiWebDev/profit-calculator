"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CreditCard, Store, Zap, AlertTriangle, CheckCircle2,
  RefreshCw, Plus, User, Bell, Key, ExternalLink, Lock,
  Globe, Clock, Shield, ArrowRight, Check, X, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency } from "@/lib/utils";
import { useRole } from "@/components/dashboard/RoleContext";
import { getTiers } from "@/lib/tiers";
import type { PricingInterval } from "@/lib/tiers";
import { usePaddlePricing } from "@/hooks/usePaddlePricing";
import { useAsyncAction } from "@/hooks/use-async-action";

// ── Static data ───────────────────────────────────────────────────────────────
// TIERS is NOT loaded at module level — getTiers() reads env vars and would
// throw during module evaluation if price IDs are missing. It's called lazily
// inside the component via useMemo instead.

const platformIcon: Record<string, string> = {
  shopify: "🛍️", csv_manual: "📄",
};

const PLAN_FEATURES: Record<string, string[]> = {
  free:    ["50 orders/month", "1 store", "CSV import"],
  starter: ["100 orders/month", "1 store", "1 ad platform", "No team members"],
  growth:  ["1,000 orders/month", "2 stores", "3 ad platforms", "AI insights (weekly)", "PDF reports", "1 team member"],
  pro:     ["Unlimited orders", "Unlimited stores", "All ad platforms", "Real-time AI insights", "API access", "5 team members"],
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

// Interval toggle config — mirrors PricingClient exactly
const INTERVALS: { iv: PricingInterval; label: string; saving: string | null }[] = [
  { iv: "month",      label: "Monthly",    saving: null    },
  { iv: "quarter",    label: "Quarterly",  saving: "−10%"  },
  { iv: "semiannual", label: "Semiannual", saving: "−15%"  },
  { iv: "year",       label: "Annual",     saving: "−20%"  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdAccountRow {
  id:          string;
  platform:    string;
  accountId:   string;
  accountName: string;
  currency:    string;
  syncStatus:  string;
  lastSyncAt?: string;
}

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
  adAccounts: AdAccountRow[];
  user: { name: string; email: string; image?: string; phone?: string };
}

type Tab = "profile" | "billing" | "stores" | "ad-accounts" | "notifications";

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
  userEmail,
  teamId,
  paddleCustomerId,
}: {
  data: SettingsData;
  userPlan: string;
  userEmail?: string;
  teamId?: string;
  paddleCustomerId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, canManageBilling } = useRole();

  const defaultTab: Tab = canManageBilling ? "billing" : "profile";
  const [tab, setTab] = useState<Tab>(defaultTab);

  // ── Ad accounts state ─────────────────────────────────────────────────────

  const [adSyncActive, updateAdSyncActive] = useState<string | null>(null);
  const [adAccountSuccess, setAdAccountSuccess] = useState<string | null>(null);

  // ── Global feedback ───────────────────────────────────────────────────────
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setFeedback = (type: "ok" | "err", msg: string) => {
    if (type === "ok") { setSuccess(msg); setError(null); }
    else               { setError(msg);   setSuccess(null); }
    setTimeout(() => { setSuccess(null); setError(null); }, 5000);
  };

  // ── ?tab= query param ─────────────────────────────────────────────────────
  // Syncs the URL query param into tab state on mount — a genuine external-system sync.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const tabParam = searchParams.get("tab") as Tab | null;
    const valid: Tab[] = ["profile", "billing", "stores", "ad-accounts", "notifications"];
    if (tabParam && valid.includes(tabParam)) {
      setTab(tabParam);
      const url = new URL(window.location.href);
      url.searchParams.delete("tab");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // OAuth redirect back — reads one-time query params into state on mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const connected = searchParams.get("connected");
    const account   = searchParams.get("account");
    if (connected) {
      const platformLabels: Record<string, string> = {
        meta: "Meta Ads",
        google: "Google Ads",
        tiktok: "TikTok Ads",
        pinterest: "Pinterest Ads",
        snapchat: "Snapchat Ads",
      };
      const label = platformLabels[connected] || `${connected.toUpperCase()} Ads`;
      setTab("ad-accounts");
      setAdAccountSuccess(account
        ? `${label} "${account}" connected successfully!`
        : `${label} connected successfully!`);
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("account");
      window.history.replaceState({}, "", url.toString());
    }
    const err = searchParams.get("error");
    if (err) {
      setTab("ad-accounts");
      setFeedback("err", `Connection error: ${err.replace(/_/g, " ")}`);
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Billing — Paddle.js (mirrors PricingClient exactly) ──────────────────
  const [upgradeInterval, setUpgradeInterval] = useState<PricingInterval>("month");
  const [cancelling,     setCancelling]     = useState(false);
  const [portalLoading,  setPortalLoading]  = useState(false);

  // Lazy — avoids module-level getTiers() which runs before client env vars are inlined
  const tiers = useMemo(() => getTiers(), []);
  const currentPlan = data.subscription?.plan || data.team?.plan || userPlan || "free";

  const {
    paddleReady,
    pricesLoaded,
    openingTier,
    checkoutError,
    clearCheckoutError,
    openCheckout,
    getDisplayPrice,
    getBillingLabel,
  } = usePaddlePricing(tiers, undefined, paddleCustomerId);

  const anyOpening = openingTier !== null;

  const handleSubscribe = (tierId: string) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    openCheckout(tier, upgradeInterval, {
      userEmail,
      teamId,
      onComplete: () => router.refresh(),
    });
  };

  // ── Store state ───────────────────────────────────────────────────────────
  const [storeSyncActive, updateStoreSyncActive] = useState<string | null>(null);

  // ── Profile state ─────────────────────────────────────────────────────────
  const [displayName,   setDisplayName]   = useState(data.user.name);
  // Optional WhatsApp number for admin campaigns (E.164). Empty = no number on file.
  const [phone,         setPhone]         = useState(data.user.phone ?? "");

  // ── Workspace state ───────────────────────────────────────────────────────
  const [wsName,          setWsName]          = useState(data.team?.name     ?? "");
  const [wsCurrency,      setWsCurrency]      = useState(data.team?.currency ?? "USD");
  const [wsTimezone,      setWsTimezone]      = useState(data.team?.timezone ?? "UTC");

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
  const [notifsLoaded,  setNotifsLoaded]  = useState(false);

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

  const saveProfileAction = useAsyncAction(async () => {
    if (!displayName.trim()) return;
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim(), phone: phone.trim() }),
      });
      if (res.ok) { setFeedback("ok", "Profile updated."); router.refresh(); }
      else { const j = await res.json(); setFeedback("err", j.error ?? "Save failed."); }
    } catch { setFeedback("err", "Save failed. Check your connection and try again."); }
  });

  const saveProfile = () => {
    void saveProfileAction.run();
  };

  const saveWorkspaceAction = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wsName.trim(), currency: wsCurrency, timezone: wsTimezone }),
      });
      if (res.ok) { setFeedback("ok", "Workspace settings saved."); router.refresh(); }
      else { const j = await res.json(); setFeedback("err", j.error ?? "Save failed."); }
    } catch { setFeedback("err", "Save failed. Check your connection and try again."); }
  });

  const saveWorkspace = () => {
    void saveWorkspaceAction.run();
  };

  const saveNotifsAction = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...notifPrefs, slackWebhookUrl: slackWebhook }),
      });
      if (res.ok) setFeedback("ok", "Notification preferences saved.");
      else { const j = await res.json(); setFeedback("err", j.error ?? "Save failed."); }
    } catch { setFeedback("err", "Save failed. Check your connection and try again."); }
  });

  const saveNotifications = () => {
    void saveNotifsAction.run();
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

  const openPortal = async () => {
    setPortalLoading(true); setError(null);
    try {
      const returnUrl = `${window.location.origin}/dashboard/settings`;
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Could not open billing portal.");
      window.location.href = json.url;
    } catch (err) {
      setFeedback("err", err instanceof Error ? err.message : "Could not open billing portal.");
    } finally { setPortalLoading(false); }
  };

  const syncStore = async (storeId: string) => {
    updateStoreSyncActive(storeId);
    try { await fetch(`/api/stores/${storeId}/sync`, { method: "POST" }); router.refresh(); }
    finally { updateStoreSyncActive(null); }
  };

  const [disconnectingStoreId, setDisconnectingStoreId] = useState<string | null>(null);
  const disconnectStore = async (storeId: string) => {
    if (!window.confirm("Are you sure you want to disconnect this store? Order history will be preserved.")) return;
    setDisconnectingStoreId(storeId);
    try {
      const res = await fetch(`/api/stores/${storeId}`, { method: "DELETE" });
      if (res.ok) {
        setFeedback("ok", "Store disconnected successfully.");
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setFeedback("err", j.error ?? "Failed to disconnect store.");
      }
    } catch {
      setFeedback("err", "Failed to disconnect store.");
    } finally {
      setDisconnectingStoreId(null);
    }
  };

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  const connectAdPlatform = async (platform: string, label: string) => {
    setConnectingPlatform(platform); setError(null);
    try {
      const res = await fetch(`/api/ad-accounts/${platform}/auth`, { method: "POST" });
      const j   = await res.json();
      if (j.oauthUrl) { window.location.href = j.oauthUrl; }
      else { setFeedback("err", j.message ?? `${label} OAuth not configured.`); setConnectingPlatform(null); }
    } catch {
      setFeedback("err", `Failed to initiate ${label} connection.`);
      setConnectingPlatform(null);
    }
  };

  const connectTikTok = () => connectAdPlatform("tiktok", "TikTok Ads");
  const connectingTikTok = connectingPlatform === "tiktok";

  const syncAdAccount = async (adAccountId: string) => {
    updateAdSyncActive(adAccountId);
    try {
      await fetch("/api/ad-accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId }),
      });
      router.refresh();
    } finally { updateAdSyncActive(null); }
  };

  const [disconnectingAdAccountId, setDisconnectingAdAccountId] = useState<string | null>(null);
  const disconnectAdAccount = async (adAccountId: string) => {
    if (!window.confirm("Are you sure you want to disconnect this ad account? Past spend data will be preserved.")) return;
    setDisconnectingAdAccountId(adAccountId);
    try {
      const res = await fetch(`/api/ad-accounts/${adAccountId}`, { method: "DELETE" });
      if (res.ok) {
        setFeedback("ok", "Ad account disconnected successfully.");
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setFeedback("err", j.error ?? "Failed to disconnect ad account.");
      }
    } catch {
      setFeedback("err", "Failed to disconnect ad account.");
    } finally {
      setDisconnectingAdAccountId(null);
    }
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const sub        = data.subscription;
  const isTrialing = sub?.status === "trialing";

  const intervalLabel: Record<string, string> = {
    monthly:    "mo",
    quarterly:  "3 mo",
    semiannual: "6 mo",
    annual:     "yr",
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile",       label: "Profile" },
    { key: "billing",       label: "Billing & Plan" },
    { key: "stores",        label: "Connected Stores" },
    { key: "ad-accounts",   label: "Ad Accounts" },
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
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
          <button className="ml-auto" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />{success}
          <button className="ml-auto" onClick={() => setSuccess(null)} aria-label="Dismiss message">✕</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="md:flex grid grid-cols-3 items-center gap-1 border-b border-[var(--color-border)] pb-5 mb-2 overflow-x-auto">
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
                    <Badge variant={currentPlan === "pro" ? "default" : "outline"} className="text-xs capitalize">
                      {currentPlan} plan
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[var(--color-border)]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Display Name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-9" disabled={saveProfileAction.loading} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input defaultValue={data.user.email} type="email" className="h-9" disabled />
                  <p className="text-xs text-[var(--color-muted-foreground)]">Email cannot be changed after registration.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">WhatsApp Number (optional)</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+923001234567" className="h-9" disabled={saveProfileAction.loading} />
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    E.164 format, e.g. +923001234567. Only used to receive admin WhatsApp announcements — leave blank to opt out.
                  </p>
                </div>
                <Button
                  size="sm" className="w-fit gap-2" onClick={saveProfile}
                  loading={saveProfileAction.loading} loadingText="Saving…"
                  disabled={!displayName.trim() || (displayName.trim() === data.user.name && phone.trim() === (data.user.phone ?? ""))}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
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
                  <Input value={wsName} onChange={(e) => setWsName(e.target.value)} className="h-9" disabled={saveWorkspaceAction.loading} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Currency</Label>
                    <select value={wsCurrency} onChange={(e) => setWsCurrency(e.target.value)} disabled={saveWorkspaceAction.loading}
                      className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm disabled:opacity-50">
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Timezone</Label>
                    <select value={wsTimezone} onChange={(e) => setWsTimezone(e.target.value)} disabled={saveWorkspaceAction.loading}
                      className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm disabled:opacity-50">
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-2" onClick={saveWorkspace} loading={saveWorkspaceAction.loading} loadingText="Saving…">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Save Workspace Settings
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── BILLING TAB ──────────────────────────────────────────────────────── */}
      {tab === "billing" && canManageBilling && (
        <div className="space-y-4 w-full max-w-3xl">

          {/* ── Current subscription ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sub ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl bg-[var(--color-muted)] border border-[var(--color-border)]">
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--color-foreground)] capitalize text-lg leading-tight">
                        {sub.plan} Plan
                      </p>
                      <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5 leading-snug">
                        {formatCurrency(sub.amount / 100, sub.currency)}/
                        {intervalLabel[sub.interval] ?? "mo"}
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
                      className="capitalize text-xs self-start sm:self-center flex-shrink-0"
                    >
                      {sub.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {(PLAN_FEATURES[sub.plan] ?? []).map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />{f}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                    {sub.plan !== "pro" && !sub.cancelAtPeriodEnd && (
                      <Button
                        size="sm" className="w-full sm:w-auto gap-2"
                        onClick={() => setTab("billing")}
                        disabled={anyOpening}
                      >
                        <Zap className="h-3.5 w-3.5" /> Upgrade
                      </Button>
                    )}
                    <Button
                      variant="outline" size="sm" onClick={openPortal} loading={portalLoading} loadingText="Opening…"
                      className="w-full sm:w-auto gap-2"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Billing Portal
                    </Button>
                    {!sub.cancelAtPeriodEnd && (
                      <Button
                        variant="outline" size="sm" onClick={cancelSubscription} loading={cancelling} loadingText="Cancelling…"
                        className="w-full sm:w-auto text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950 gap-2"
                      >
                        Cancel Subscription
                      </Button>
                    )}
                    {sub.cancelAtPeriodEnd && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        Your plan was cancelled. Access ends{" "}
                        {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : ""}.{" "}
                        <button
                          className="text-[var(--color-primary)] hover:underline"
                          onClick={openPortal} disabled={portalLoading}
                        >
                          {portalLoading ? "Opening…" : "Manage billing →"}
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 text-sm text-yellow-700 dark:text-yellow-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  You&apos;re on the Free plan with limited features.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Upgrade plan cards — exact PricingClient layout ───────────── */}
          {currentPlan !== "pro" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3">
                  <CardTitle className="text-base">Upgrade Your Plan</CardTitle>

                  {/* Checkout error */}
                  {checkoutError && (
                    <div
                      role="alert"
                      className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-600"
                    >
                      {checkoutError}
                      <button className="ml-auto shrink-0" onClick={clearCheckoutError} aria-label="Dismiss">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* 4-option interval selector — matches PricingClient exactly */}
                  <div
                    role="group"
                    aria-label="Billing interval"
                    className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-1 gap-1 flex-wrap"
                  >
                    {INTERVALS.map(({ iv, label, saving }) => {
                      const isActive = upgradeInterval === iv;
                      return (
                        <button
                          key={iv}
                          onClick={() => setUpgradeInterval(iv)}
                          aria-pressed={isActive}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                            isActive
                              ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                          )}
                        >
                          {label}
                          {saving && (
                            <span className={cn(
                              "ml-1.5 text-[10px] font-bold",
                              isActive ? "text-green-600 dark:text-green-400" : "text-green-500/60"
                            )}>
                              {saving}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {tiers.map((tier) => {
                    const isCurrentPlan  = currentPlan === tier.id;
                    const isHighlighted  = !!tier.highlighted;
                    const isOpening      = openingTier === tier.id;
                    const displayPrice   = getDisplayPrice(tier.id, upgradeInterval);
                    const billingLabel   = getBillingLabel(tier.id, upgradeInterval);

                    return (
                      <div
                        key={tier.id}
                        className={cn(
                          "relative rounded-2xl border-2 p-5 flex flex-col transition-all",
                          isHighlighted
                            ? "border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/10"
                            : "border-[var(--color-border)]",
                          isCurrentPlan && "opacity-60",
                          "bg-[var(--color-card)]"
                        )}
                      >
                        {isHighlighted && (
                          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                            <Badge
                              variant="success"
                              className="text-[10px] font-bold px-3 py-1 uppercase tracking-wide"
                            >
                              Most Popular
                            </Badge>
                          </div>
                        )}

                        {/* Name + description */}
                        <h3 className="text-base font-bold text-[var(--color-foreground)] mb-0.5">
                          {tier.name}
                        </h3>
                        <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
                          {tier.description}
                        </p>

                        {/* Price — Paddle-formatted, verbatim */}
                        <div className="mb-1 flex items-end gap-1">
                          <span
                            className={cn(
                              "text-3xl font-extrabold text-[var(--color-foreground)] transition-opacity",
                              !pricesLoaded && "opacity-40 animate-pulse"
                            )}
                            aria-label={`${displayPrice} per month`}
                          >
                            {displayPrice}
                          </span>
                          <span className="text-sm text-[var(--color-muted-foreground)] mb-1">/mo</span>
                        </div>

                        {/* Billing cadence */}
                        <p className={cn(
                          "text-xs text-[var(--color-muted-foreground)] mb-5 transition-opacity",
                          !pricesLoaded && "opacity-40"
                        )}>
                          {billingLabel}
                        </p>

                        {/* Feature list */}
                        <ul className="space-y-1.5 flex-1 mb-4">
                          {tier.features.map((f) => (
                            <li key={f} className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                              <Check className="h-3 w-3 text-green-500 flex-shrink-0" />{f}
                            </li>
                          ))}
                        </ul>

                        {/* CTA */}
                        {isCurrentPlan ? (
                          <Badge variant="success" className="w-full justify-center text-xs">Current Plan</Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full gap-1.5"
                            variant={isHighlighted ? "default" : "outline"}
                            disabled={anyOpening || !paddleReady}
                            loading={isOpening}
                            loadingText="Opening…"
                            onClick={() => handleSubscribe(tier.id)}
                            aria-label={`Subscribe to ${tier.name}`}
                          >
                            Subscribe <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Trust line */}
                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
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
                      Connect a Shopify store to start syncing orders.
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
                            {store.lastSyncAt ? `Last synced ${new Date(store.lastSyncAt).toLocaleDateString()}` : "Never synced"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={store.syncStatus === "idle" ? "success" : store.syncStatus === "syncing" ? "outline" : store.syncStatus === "error" ? "destructive" : "outline"}
                          className="text-xs capitalize"
                        >
                          {store.syncStatus === "syncing"
                            ? <span className="flex items-center gap-1"><Spinner size="sm" className="h-2.5 w-2.5" label="" /> Syncing</span>
                            : store.syncStatus}
                        </Badge>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => syncStore(store.id)}
                          disabled={storeSyncActive === store.id || store.syncStatus === "syncing"}
                          title="Sync now"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", storeSyncActive === store.id && "animate-spin")} />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-[var(--color-muted-foreground)] hover:text-red-600"
                          onClick={() => disconnectStore(store.id)}
                          disabled={disconnectingStoreId === store.id}
                          title="Disconnect store"
                        >
                          {disconnectingStoreId === store.id ? <Spinner size="sm" className="h-3.5 w-3.5" label="" /> : <Trash2 className="h-3.5 w-3.5" />}
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

      {/* ── AD ACCOUNTS TAB ──────────────────────────────────────────────────── */}
      {tab === "ad-accounts" && (
        <div className="space-y-4 max-w-2xl">
          {adAccountSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {adAccountSuccess}
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-lg">🎵</span> TikTok Ads
                </CardTitle>
                <Button size="sm" className="gap-1.5" onClick={connectTikTok} disabled={connectingTikTok}>
                  {connectingTikTok ? <Spinner size="sm" className="h-3.5 w-3.5" label="" /> : <Plus className="h-3.5 w-3.5" />}
                  Connect TikTok Ads
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.adAccounts.filter((a) => a.platform === "tiktok").length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <span className="text-4xl">🎵</span>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">No TikTok Ads account connected</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Connect your TikTok Ads account to pull spend data into your dashboard.
                  </p>
                  <Button size="sm" onClick={connectTikTok} disabled={connectingTikTok} className="gap-2 mt-2">
                    {connectingTikTok ? <Spinner size="sm" className="h-3.5 w-3.5" label="" /> : <Zap className="h-3.5 w-3.5" />}
                    Connect Now
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.adAccounts.filter((a) => a.platform === "tiktok").map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🎵</span>
                        <div>
                          <p className="font-medium text-sm text-[var(--color-foreground)]">{acc.accountName}</p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">ID: {acc.accountId} · {acc.currency}</p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {acc.lastSyncAt ? `Last synced ${new Date(acc.lastSyncAt).toLocaleDateString()}` : "Never synced"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={acc.syncStatus === "idle" ? "success" : acc.syncStatus === "syncing" ? "outline" : acc.syncStatus === "error" ? "destructive" : "outline"}
                          className="text-xs capitalize"
                        >
                          {acc.syncStatus === "syncing"
                            ? <span className="flex items-center gap-1"><Spinner size="sm" className="h-2.5 w-2.5" label="" /> Syncing</span>
                            : acc.syncStatus}
                        </Badge>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => syncAdAccount(acc.id)}
                          disabled={adSyncActive === acc.id || acc.syncStatus === "syncing"}
                          title="Sync now"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", adSyncActive === acc.id && "animate-spin")} />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-[var(--color-muted-foreground)] hover:text-red-600"
                          onClick={() => disconnectAdAccount(acc.id)}
                          disabled={disconnectingAdAccountId === acc.id}
                          title="Disconnect ad account"
                        >
                          {disconnectingAdAccountId === acc.id ? <Spinner size="sm" className="h-3.5 w-3.5" label="" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {([
            { platform: "meta",      label: "Meta Ads",      emoji: "📘" },
            { platform: "google",    label: "Google Ads",    emoji: "🔴" },
            { platform: "pinterest", label: "Pinterest Ads", emoji: "📌" },
            { platform: "snapchat",  label: "Snapchat Ads",  emoji: "👻" },
          ] as const).map(({ platform, label, emoji }) => {
            const accounts = data.adAccounts.filter((a) => a.platform === platform);
            const connecting = connectingPlatform === platform;
            return (
            <Card key={platform}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-lg">{emoji}</span>
                    {label}
                  </CardTitle>
                  <Button size="sm" className="gap-1.5" onClick={() => connectAdPlatform(platform, label)} disabled={connecting}>
                    {connecting ? <Spinner size="sm" className="h-3.5 w-3.5" label="" /> : <Plus className="h-3.5 w-3.5" />}
                    Connect {label}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <span className="text-4xl">{emoji}</span>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">No {label} account connected</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Connect your {label} account to pull spend data into your dashboard.
                    </p>
                    <Button size="sm" onClick={() => connectAdPlatform(platform, label)} disabled={connecting} className="gap-2 mt-2">
                      {connecting ? <Spinner size="sm" className="h-3.5 w-3.5" label="" /> : <Zap className="h-3.5 w-3.5" />}
                      Connect Now
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{emoji}</span>
                          <div>
                            <p className="font-medium text-sm text-[var(--color-foreground)]">{acc.accountName}</p>
                            <p className="text-xs text-[var(--color-muted-foreground)]">ID: {acc.accountId} · {acc.currency}</p>
                            <p className="text-xs text-[var(--color-muted-foreground)]">
                              {acc.lastSyncAt ? `Last synced ${new Date(acc.lastSyncAt).toLocaleDateString()}` : "Never synced"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={acc.syncStatus === "idle" ? "success" : acc.syncStatus === "syncing" ? "outline" : acc.syncStatus === "error" ? "destructive" : "outline"}
                            className="text-xs capitalize"
                          >
                            {acc.syncStatus === "syncing"
                              ? <span className="flex items-center gap-1"><Spinner size="sm" className="h-2.5 w-2.5" label="" /> Syncing</span>
                              : acc.syncStatus}
                          </Badge>
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={() => syncAdAccount(acc.id)}
                            disabled={adSyncActive === acc.id || acc.syncStatus === "syncing"}
                            title="Sync now"
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", adSyncActive === acc.id && "animate-spin")} />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0 text-[var(--color-muted-foreground)] hover:text-red-600"
                            onClick={() => disconnectAdAccount(acc.id)}
                            disabled={disconnectingAdAccountId === acc.id}
                            title="Disconnect ad account"
                          >
                            {disconnectingAdAccountId === acc.id ? <Spinner size="sm" className="h-3.5 w-3.5" label="" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ────────────────────────────────────────────────── */}
      {tab === "notifications" && (
        <div className="space-y-4 max-w-xl">
          {!notifsLoaded && (
            <p className="text-sm text-[var(--color-muted-foreground)] flex items-center gap-2" role="status">
              <Spinner size="sm" label="" /> Loading notification settings…
            </p>
          )}
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
                  <Toggle checked={notifPrefs[key]} onChange={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))} disabled={saveNotifsAction.loading} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> Slack Notifications
                {!["growth", "pro"].includes(currentPlan) && (
                  <Badge variant="outline" className="ml-auto text-xs text-[var(--color-muted-foreground)]">
                    <Lock className="h-3 w-3 mr-1" /> Growth+
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!["growth", "pro"].includes(currentPlan) ? (
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
                        disabled={saveNotifsAction.loading || testingSlack}
                      />
                      <Button
                        size="sm" variant="outline"
                        disabled={!slackWebhook || testingSlack}
                        loading={testingSlack} loadingText="Testing…"
                        onClick={testSlack}
                        className="h-9 gap-1.5 whitespace-nowrap"
                      >
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
                  <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                    <p className="text-xs font-medium text-[var(--color-foreground)]">Slack alert triggers</p>
                    {([
                      { key: "slack_goal_behind", label: "Goal behind pace" },
                      { key: "slack_margin_drop", label: "Margin drop" },
                    ] as const).map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-[var(--color-muted-foreground)]">{label}</span>
                        <Toggle checked={notifPrefs[key]} onChange={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))} disabled={saveNotifsAction.loading} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={saveNotifications} loading={saveNotifsAction.loading} loadingText="Saving…" className="gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Save Notification Preferences
          </Button>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4" /> API Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-3">
                Generate API keys to access your data programmatically.
                {currentPlan !== "pro" && " Requires Pro plan."}
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
