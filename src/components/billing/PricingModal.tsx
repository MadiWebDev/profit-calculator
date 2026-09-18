"use client";

/**
 * PricingModal
 * ─────────────
 * Full-featured pricing overlay. Supports 4 billing intervals:
 *   Monthly · 3 Months (-10%) · 6 Months (-15%) · 1 Year (-20%)
 *
 * Prices are fetched live from Paddle via usePaddleCheckout.
 * Falls back to static base prices while loading.
 *
 * dismissible={false} forces the user to upgrade or sign out (archived state).
 */

import { useState } from "react";
import { Check, X, Zap, Loader2, ArrowRight, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_DISPLAY, INTERVAL_META, ALL_INTERVALS } from "@/lib/plans";
import type { BillingInterval, PlanKey } from "@/lib/billing";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

// ── Plan feature lists ────────────────────────────────────────────────────────

const PLAN_FEATURES: Record<PlanKey, string[]> = {
  starter: [
    "100 orders / month",
    "1 store",
    "1 ad platform",
    "CSV import",
    "Email support",
    "2 team members",
  ],
  growth: [
    "1,000 orders / month",
    "2 stores",
    "3 ad platforms",
    "AI insights (weekly digest)",
    "PDF reports",
    "Slack alerts",
    "5 team members",
  ],
  pro: [
    "Unlimited orders",
    "Unlimited stores",
    "All ad platforms",
    "Real-time AI insights",
    "Public API + Zapier",
    "Priority chat support",
    "Unlimited team members",
  ],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface PricingModalProps {
  open: boolean;
  /** false = no close button, forces upgrade (archived state) */
  dismissible?: boolean;
  onClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingModal({ open, dismissible = true, onClose }: PricingModalProps) {
  const [interval,   setInterval]   = useState<BillingInterval>("monthly");
  const [activePlan, setActivePlan] = useState<PlanKey | null>(null);

  const { openCheckout, loading, error, clearError, getPrice, getTotalPrice, getCurrency, pricesLoaded } =
    usePaddleCheckout();

  const handleUpgrade = async (plan: PlanKey) => {
    setActivePlan(plan);
    await openCheckout(plan, interval);
    setActivePlan(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && dismissible && onClose) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "max-w-4xl w-full p-0 overflow-hidden gap-0",
          !dismissible && "[&>button]:hidden"
        )}
        onInteractOutside={(e) => { if (!dismissible) e.preventDefault(); }}
        onEscapeKeyDown={(e)    => { if (!dismissible) e.preventDefault(); }}
      >
        <DialogTitle className="sr-only">Choose a plan</DialogTitle>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="relative bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent px-6 pt-8 pb-6 text-center border-b border-[var(--color-border)]">
          {dismissible && onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 rounded-full p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="inline-flex items-center gap-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-full px-3 py-1 text-xs font-semibold mb-3">
            <Zap className="h-3.5 w-3.5" />
            Upgrade to continue
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-foreground)] mb-1">
            Choose a plan
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)] max-w-sm mx-auto mb-5">
            Pick the plan and billing period that fits your store. Cancel anytime.
          </p>

          {/* ── Interval selector (4 tabs) ─────────────────────────────── */}
          <div className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-1 gap-0.5">
            {ALL_INTERVALS.map((iv) => {
              const meta    = INTERVAL_META[iv];
              const isActive = interval === iv;
              return (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  className={cn(
                    "relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                      : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  )}
                >
                  {meta.label}
                  {meta.discountPct > 0 && (
                    <span
                      className={cn(
                        "ml-1.5 text-[10px] font-bold",
                        isActive ? "text-green-600 dark:text-green-400" : "text-green-500/70"
                      )}
                    >
                      −{meta.discountPct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
            <button className="ml-auto shrink-0" onClick={clearError} aria-label="Dismiss error">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ── Plan cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
          {(["starter", "growth", "pro"] as PlanKey[]).map((plan) => {
            const isGrowth   = plan === "growth";
            const isLoading  = loading && activePlan === plan;
            const anyLoading = loading;

            const perMonth    = getPrice(plan, interval);
            const totalCharge = getTotalPrice(plan, interval);
            const currency    = getCurrency(plan, interval);
            const meta        = INTERVAL_META[interval];

            // Format helpers
            const fmtMoney = (n: number) =>
              new Intl.NumberFormat("en-US", {
                style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
              }).format(n);

            return (
              <div
                key={plan}
                className={cn(
                  "relative flex flex-col rounded-2xl border-2 p-5 transition-all",
                  isGrowth
                    ? "border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/10"
                    : "border-[var(--color-border)]",
                  "bg-[var(--color-card)]"
                )}
              >
                {isGrowth && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge variant="success" className="text-[10px] font-bold px-3 py-1 uppercase tracking-wide">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Plan name + price */}
                <div className="mb-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-[var(--color-muted-foreground)] mb-1">
                    {PLAN_DISPLAY[plan].name}
                  </p>

                  {/* Per-month price */}
                  <div className="flex items-end gap-1">
                    <span
                      className={cn(
                        "text-4xl font-extrabold text-[var(--color-foreground)] transition-opacity",
                        !pricesLoaded && "opacity-50"
                      )}
                    >
                      {fmtMoney(perMonth)}
                    </span>
                    <span className="text-sm text-[var(--color-muted-foreground)] mb-1.5">/mo</span>
                  </div>

                  {/* Billing cadence sub-line */}
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    {interval === "monthly" ? (
                      "billed monthly"
                    ) : (
                      <>
                        {fmtMoney(totalCharge)} {meta.billedLabel}
                        {meta.discountPct > 0 && (
                          <span className="ml-1.5 font-semibold text-green-600 dark:text-green-400">
                            save {meta.discountPct}%
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>

                {/* Feature list */}
                <ul className="space-y-2 flex-1 mb-5">
                  {PLAN_FEATURES[plan].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]">
                      <Check className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  className="w-full gap-2"
                  variant={isGrowth ? "default" : "outline"}
                  disabled={anyLoading}
                  onClick={() => handleUpgrade(plan)}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {isLoading ? "Opening checkout…" : "Get started"}
                </Button>
              </div>
            );
          })}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 pb-5 px-6 text-xs text-[var(--color-muted-foreground)]">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          Payments processed securely via Paddle. Cancel anytime from Settings.
        </div>
      </DialogContent>
    </Dialog>
  );
}
