"use client";

/**
 * PricingModal
 * ─────────────
 * Full-featured pricing overlay shown when an account is archived (trial
 * expired, no active subscription) or when the user manually opens upgrade UI.
 *
 * Uses usePaddleCheckout which:
 *  • Opens a Paddle.js inline overlay when PAYMENT_GATEWAY=paddle and
 *    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is present.
 *  • Falls back to a full-page redirect for all other gateway configurations
 *    (Dodo, or Paddle without a client token).
 */

import { useState } from "react";
import { Check, X, Zap, Loader2, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_DISPLAY } from "@/lib/plans";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

type Interval = "monthly" | "annual";
type PlanKey  = "starter" | "growth" | "pro";

const PLAN_FEATURES: Record<PlanKey, string[]> = {
  starter: [
    "100 orders / month",
    "1 store",
    "1 ad platform",
    "CSV import",
    "Email support",
  ],
  growth: [
    "1,000 orders / month",
    "2 stores",
    "3 ad platforms",
    "AI insights (weekly)",
    "PDF reports",
    "Slack alerts",
  ],
  pro: [
    "Unlimited orders",
    "Unlimited stores",
    "All ad platforms",
    "Real-time AI insights",
    "Public API",
    "Priority chat support",
  ],
};

interface PricingModalProps {
  open: boolean;
  /** Pass false to hide the close button — forces selection (archived state) */
  dismissible?: boolean;
  onClose?: () => void;
}

export function PricingModal({
  open,
  dismissible = true,
  onClose,
}: PricingModalProps) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [activePlan, setActivePlan] = useState<PlanKey | null>(null);

  const { openCheckout, loading, error, clearError } = usePaddleCheckout();

  const price = (plan: PlanKey) =>
    interval === "annual"
      ? PLAN_DISPLAY[plan].annualPrice
      : PLAN_DISPLAY[plan].price;

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
        <div className="bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent px-6 pt-8 pb-6 text-center border-b border-[var(--color-border)]">
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
          <p className="text-sm text-[var(--color-muted-foreground)] max-w-sm mx-auto">
            Pick the plan that fits your store. Cancel anytime, no lock-in.
          </p>

          {/* Monthly / Annual toggle */}
          <div className="mt-4 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] p-1">
            {(["monthly", "annual"] as Interval[]).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium transition-colors capitalize",
                  interval === i
                    ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                )}
              >
                {i}
                {i === "annual" && (
                  <span className="ml-1.5 text-green-600 dark:text-green-400 font-bold">
                    −20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
            <button className="ml-auto" onClick={clearError}>
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
                    <Badge
                      variant="success"
                      className="text-[10px] font-bold px-3 py-1 uppercase tracking-wide"
                    >
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Plan name + price */}
                <div className="mb-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-[var(--color-muted-foreground)] mb-1">
                    {plan}
                  </p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-[var(--color-foreground)]">
                      ${price(plan).toFixed(2)}
                    </span>
                    <span className="text-sm text-[var(--color-muted-foreground)] mb-1.5">
                      /mo
                    </span>
                  </div>
                  {interval === "annual" && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      billed ${(price(plan) * 12).toFixed(0)} / year
                    </p>
                  )}
                </div>

                {/* Feature list */}
                <ul className="space-y-2 flex-1 mb-5">
                  {PLAN_FEATURES[plan].map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]"
                    >
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
                  {isLoading ? "Redirecting…" : "Get started"}
                </Button>
              </div>
            );
          })}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <p className="text-center text-xs text-[var(--color-muted-foreground)] pb-5 px-6">
          Payments processed securely via Paddle. Cancel anytime from Settings.
        </p>
      </DialogContent>
    </Dialog>
  );
}
