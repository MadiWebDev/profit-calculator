"use client";

/**
 * ArchivedWall
 * ─────────────
 * Full-page gate rendered when a user's trial has expired and they have no
 * active paid subscription.
 *
 * Security notes:
 * - No dashboard HTML is in the DOM — DevTools element deletion reveals nothing.
 * - All data API routes independently return 402 for archived accounts.
 * - PricingModal is rendered with dismissible={false} so Escape / outside-click
 *   cannot close it; the user must upgrade or sign out.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Clock, Zap, LogOut, Loader2, RefreshCw } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { PricingModal } from "@/components/billing/PricingModal";

interface ArchivedWallProps {
  trialEndedAt?: Date | string | null;
  userName?:    string;
  userEmail?:   string;
  teamId?:      string;
  paddleCustomerId?: string;
}

const UPGRADE_PENDING_KEY = "gpc_upgrade_pending";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~60s — covers normal Paddle webhook delivery

export function ArchivedWall({ trialEndedAt, userName, userEmail, teamId, paddleCustomerId }: ArchivedWallProps) {
  const [pricingOpen, setPricingOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationTimedOut, setActivationTimedOut] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Poll the server-side status until the webhook has provisioned the
  // subscription. Access is granted ONLY when the server says the account
  // is no longer archived — never on the client-side checkout event alone,
  // which Paddle fires before the webhook is processed.
  const startActivationPolling = useCallback(() => {
    stopPolling();
    setActivating(true);
    setActivationTimedOut(false);
    let attempts = 0;
    pollTimer.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch("/api/trial/status", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.isArchived) {
          stopPolling();
          try { sessionStorage.removeItem(UPGRADE_PENDING_KEY); } catch { /* ignore */ }
          window.location.reload();
        }
      } catch {
        // Transient network error — keep polling until the timeout.
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setActivating(false);
        setActivationTimedOut(true);
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Covers the redirect path: Paddle may navigate to successUrl before the
  // checkout.completed handler runs, so a pending upgrade is resumed here.
  /* eslint-disable react-hooks/set-state-in-effect -- mount-time init: a pending upgrade can only be known client-side from sessionStorage after hydration; no SSR alternative */
  useEffect(() => {
    try {
      // 1. Check for Paddle redirect parameters (e.g. ?_ptxn=txn_... or ?transaction_id=txn_...)
      const params = new URLSearchParams(window.location.search);
      const ptxn = params.get("_ptxn") || params.get("transaction_id") || params.get("txnId");
      if (ptxn) {
        setActivating(true);
        fetch("/api/billing/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: ptxn }),
        })
          .then((res) => {
            if (res.ok) {
              window.location.href = window.location.pathname;
            } else {
              startActivationPolling();
            }
          })
          .catch(() => {
            startActivationPolling();
          });
        return;
      }

      // 2. Immediate trial status verification in case account was already upgraded
      fetch("/api/trial/status", { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && !data.isArchived) {
            window.location.reload();
          }
        })
        .catch(() => {});

      // 3. Pending upgrade polling from sessionStorage
      const raw = sessionStorage.getItem(UPGRADE_PENDING_KEY);
      if (raw && Date.now() - Number(raw) < 10 * 60 * 1000) {
        startActivationPolling();
      } else if (raw) {
        sessionStorage.removeItem(UPGRADE_PENDING_KEY);
      }
    } catch {
      /* sessionStorage unavailable */
    }
  }, [startActivationPolling]);

  const handleCheckoutComplete = useCallback(() => {
    try { sessionStorage.setItem(UPGRADE_PENDING_KEY, String(Date.now())); } catch { /* ignore */ }
    startActivationPolling();
  }, [startActivationPolling]);

  const endDate      = trialEndedAt ? new Date(trialEndedAt) : null;
  const formattedDate = endDate
    ? endDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <>
      <div
        role="main"
        aria-labelledby="archived-wall-heading"
        // m-auto (not justify-center) on the card: tall content scrolls
        // normally on short phones instead of clipping at the top.
        className="min-h-dvh flex flex-col items-center bg-[var(--color-background)] px-4 py-6 sm:py-12"
      >
        <div className="m-auto w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl p-5 sm:p-8 flex flex-col items-center text-center gap-5 sm:gap-6">

          {/* Icon */}
          <div className="relative" aria-hidden="true">
            <div className="h-20 w-20 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
              <Lock className="h-9 w-9 text-[var(--color-primary)]" />
            </div>
            <span className="absolute -bottom-1 -right-1 bg-amber-100 dark:bg-amber-900 rounded-full p-1.5">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </span>
          </div>

          {/* Headline */}
          <div className="space-y-2">
            <h1 id="archived-wall-heading" className="text-xl sm:text-2xl font-extrabold text-[var(--color-foreground)]">
              {userName ? `${userName.split(" ")[0]}, your` : "Your"} free trial has ended
            </h1>
            {formattedDate && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Your 7-day trial expired on{" "}
                <span className="font-medium text-[var(--color-foreground)]">{formattedDate}</span>.
              </p>
            )}
            <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
              Your data is safe and waiting. Upgrade to any plan to instantly
              restore full access — no data loss, no setup required.
            </p>
          </div>

          {/* Feature bullets */}
          <ul className="w-full space-y-2 text-left" aria-label="Included with a paid plan">
            {[
              "Order-level profit & margin tracking",
              "Real-time store syncing",
              "Ad spend ROI & attribution",
              "Profit goals & AI insights",
            ].map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-[var(--color-muted-foreground)]">
                <span className="h-5 w-5 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Zap className="h-3 w-3 text-[var(--color-primary)]" />
                </span>
                {f}
              </li>
            ))}
          </ul>

          {/* Activation status — shown after payment, before the server confirms */}
          {activating && (
            <div role="status" className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-4 py-3 text-sm text-green-700 dark:text-green-300">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              Payment received — activating your plan…
            </div>
          )}
          {activationTimedOut && (
            <div role="alert" className="w-full rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Payment completed, but activation is still processing. It usually
              takes under a minute — refresh to check again.
              <button
                onClick={() => window.location.reload()}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 font-semibold hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Refresh
              </button>
            </div>
          )}

          {/* CTA */}
          <div className="w-full space-y-3">
            <Button className="w-full gap-2 text-base py-5" disabled={activating} onClick={() => setPricingOpen(true)}>
              <Zap className="h-4 w-4" aria-hidden="true" />
              View Plans &amp; Upgrade
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 text-sm"
              disabled={activating}
              onClick={async () => {
                setActivating(true);
                try {
                  const res = await fetch("/api/trial/status", { credentials: "same-origin" });
                  const data = await res.json();
                  if (data && !data.isArchived) {
                    window.location.reload();
                    return;
                  }
                } catch { /* ignore */ }
                setActivating(false);
              }}
            >
              <RefreshCw className={"h-4 w-4 " + (activating ? "animate-spin" : "")} aria-hidden="true" />
              {activating ? "Checking Status…" : "Already Upgraded? Check Status"}
            </Button>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors py-1"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>

        <p className="mt-6 text-xs text-[var(--color-muted-foreground)] text-center max-w-xs">
          All your historical data is preserved. Upgrading restores full access immediately.
        </p>
      </div>

      {/* dismissible={false} — user must upgrade or sign out */}
      <PricingModal
        open={pricingOpen}
        dismissible={false}
        onClose={() => setPricingOpen(false)}
        userEmail={userEmail}
        teamId={teamId}
        paddleCustomerId={paddleCustomerId}
        successUrl="/dashboard"
        onComplete={handleCheckoutComplete}
      />
    </>
  );
}
