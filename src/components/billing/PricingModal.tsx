"use client";

/**
 * PricingModal
 * ─────────────
 * Full-featured pricing overlay matching the /pricing page (PricingClient)
 * in every detail:
 *   • 4 billing intervals: Monthly · Quarterly · Semiannual · Annual
 *   • Prices via Paddle.PricePreview — country-localised, Paddle-formatted
 *   • Checkout via Paddle.Checkout.open — one-page overlay, no redirect
 *   • Pulse skeleton while prices load
 *   • Growth tier highlighted "Most Popular"
 *
 * Props:
 *   open          — controls dialog visibility
 *   dismissible   — false = no close button (archived / forced-upgrade state)
 *   onClose       — called when the dialog requests close
 *   userEmail     — prefills Paddle checkout (passed from session)
 *   teamId        — stamped on Paddle customData for webhook provisioning
 *   countryCode   — 2-letter ISO code for localised pricing (optional)
 *   onComplete    — called when checkout.completed fires
 */

import { useState, useMemo } from "react";
import { Check, X, Zap, Loader2, Shield, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getTiers } from "@/lib/tiers";
import type { PricingInterval } from "@/lib/tiers";
import { usePaddlePricing } from "@/hooks/usePaddlePricing";

// ── Interval toggle config ────────────────────────────────────────────────────

const INTERVALS: { iv: PricingInterval; label: string; saving: string | null }[] = [
  { iv: "month",      label: "Monthly",    saving: null    },
  { iv: "quarter",    label: "Quarterly",  saving: "−10%"  },
  { iv: "semiannual", label: "Semiannual", saving: "−15%"  },
  { iv: "year",       label: "Annual",     saving: "−20%"  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface PricingModalProps {
  open: boolean;
  /** false = no close button; prevents Escape / outside-click dismissal */
  dismissible?: boolean;
  onClose?: () => void;
  /** Signed-in user email — prefills checkout */
  userEmail?: string;
  /** Team ID from JWT — passed as Paddle customData for webhook provisioning */
  teamId?: string;
  /** 2-letter ISO country code for localised prices */
  countryCode?: string;
  /** Called on checkout.completed */
  onComplete?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingModal({
  open,
  dismissible = true,
  onClose,
  userEmail,
  teamId,
  countryCode,
  onComplete,
}: PricingModalProps) {
  const [interval, setInterval] = useState<PricingInterval>("month");

  // Lazy — avoids module-level getTiers() which runs before client env vars are inlined
  const tiers = useMemo(() => getTiers(), []);

  const {
    paddleReady,
    pricesLoaded,
    openingTier,
    checkoutError,
    clearCheckoutError,
    openCheckout,
    getDisplayPrice,
    getBillingLabel,
  } = usePaddlePricing(tiers, countryCode);

  const anyOpening = openingTier !== null;

  const handleSubscribe = (tierId: string) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    openCheckout(tier, interval, { userEmail, teamId, onComplete });
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

          {/* ── 4-option interval toggle ───────────────────────────────────── */}
          <div
            role="group"
            aria-label="Billing interval"
            className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-1 gap-1 flex-wrap justify-center"
          >
            {INTERVALS.map(({ iv, label, saving }) => {
              const isActive = interval === iv;
              return (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  aria-pressed={isActive}
                  className={cn(
                    "relative px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                      : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  )}
                >
                  {label}
                  {saving && (
                    <span
                      className={cn(
                        "ml-1.5 text-[10px] font-bold",
                        isActive
                          ? "text-green-600 dark:text-green-400"
                          : "text-green-500/60"
                      )}
                    >
                      {saving}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Checkout error banner ─────────────────────────────────────────── */}
        {checkoutError && (
          <div
            role="alert"
            className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-600"
          >
            {checkoutError}
            <button className="ml-auto shrink-0" onClick={clearCheckoutError} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ── Plan cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
          {tiers.map((tier) => {
            const isHighlighted  = !!tier.highlighted;
            const isOpening      = openingTier === tier.id;
            const displayPrice   = getDisplayPrice(tier.id, interval);
            const billingLabel   = getBillingLabel(tier.id, interval);

            return (
              <div
                key={tier.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border-2 p-5 transition-all",
                  isHighlighted
                    ? "border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/10"
                    : "border-[var(--color-border)]",
                  "bg-[var(--color-card)]"
                )}
              >
                {isHighlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge
                      variant="success"
                      className="text-[10px] font-bold px-3 py-1 uppercase tracking-wide"
                    >
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Plan name + description */}
                <h3 className="text-base font-bold text-[var(--color-foreground)] mb-0.5">
                  {tier.name}
                </h3>
                <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
                  {tier.description}
                </p>

                {/* Price — Paddle-formatted string, verbatim */}
                <div className="mb-1 flex items-end gap-1">
                  <span
                    className={cn(
                      "text-4xl font-extrabold text-[var(--color-foreground)] transition-opacity",
                      !pricesLoaded && "opacity-40 animate-pulse"
                    )}
                    aria-label={`${displayPrice} per month`}
                  >
                    {displayPrice}
                  </span>
                  <span className="text-sm text-[var(--color-muted-foreground)] mb-1.5">/mo</span>
                </div>

                {/* Billing cadence */}
                <p
                  className={cn(
                    "text-xs text-[var(--color-muted-foreground)] mb-5 transition-opacity",
                    !pricesLoaded && "opacity-40"
                  )}
                >
                  {billingLabel}
                </p>

                {/* Subscribe button */}
                <Button
                  className="w-full mb-5 gap-1.5"
                  variant={isHighlighted ? "default" : "outline"}
                  disabled={anyOpening || !paddleReady}
                  onClick={() => handleSubscribe(tier.id)}
                  aria-label={`Subscribe to ${tier.name}`}
                >
                  {isOpening ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Opening…
                    </>
                  ) : (
                    <>
                      Subscribe
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>

                {/* Feature list */}
                <ul className="space-y-2 flex-1" aria-label={`${tier.name} features`}>
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]"
                    >
                      <Check
                        className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 pb-5 px-6 text-xs text-[var(--color-muted-foreground)]">
          <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Payments processed securely via Paddle. Cancel anytime from Settings.
        </div>
      </DialogContent>
    </Dialog>
  );
}
