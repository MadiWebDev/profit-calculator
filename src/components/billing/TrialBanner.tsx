"use client";

/**
 * TrialBanner
 * ────────────
 * Slim top-of-page banner shown during the active trial window.
 * Dismissible per session (reappears on hard refresh).
 * "Upgrade now" opens PricingModal with the user's email/teamId pre-loaded
 * so Paddle can prefill the checkout form and stamp customData.
 */

import { useState } from "react";
import { Clock, X, Zap } from "lucide-react";
import { PricingModal } from "@/components/billing/PricingModal";
import { cn } from "@/lib/utils";

interface TrialBannerProps {
  daysLeft:   number;
  userEmail?: string;
  teamId?:    string;
}

export function TrialBanner({ daysLeft, userEmail, teamId }: TrialBannerProps) {
  const [dismissed,    setDismissed]    = useState(false);
  // Trial ending (≤2 days left): open the upgrade modal on arrival so the
  // user cannot miss it. It stays dismissible — the trial is still active,
  // so the dashboard itself is NOT blocked until it actually expires.
  const [pricingOpen,  setPricingOpen]  = useState(daysLeft <= 2);

  if (dismissed) return null;

  const urgent = daysLeft <= 2;

  return (
    <>
      <div
        className={cn(
          // Wrap + right padding: on a narrow phone the dismiss button used
          // to sit on top of the banner text.
          "relative flex flex-wrap items-center justify-center gap-2 px-4 pr-12 py-2.5 text-xs sm:text-sm font-medium",
          urgent ? "bg-amber-500 text-white" : "bg-[var(--color-primary)] text-white"
        )}
      >
        <Clock className="h-4 w-4 flex-shrink-0" />

        <span className="text-center">
          {daysLeft <= 0
            ? "Your free trial ends today."
            : daysLeft === 1
            ? "1 day left in your free trial."
            : `${daysLeft} days left in your free trial.`}
        </span>

        <button
          onClick={() => setPricingOpen(true)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-0.5 text-xs font-semibold transition-colors",
            urgent
              ? "bg-white text-amber-600 hover:bg-amber-50"
              : "bg-white/20 hover:bg-white/30 text-white"
          )}
        >
          <Zap className="h-3 w-3" />
          Upgrade now
        </button>

        <button
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss trial banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <PricingModal
        open={pricingOpen}
        dismissible
        onClose={() => setPricingOpen(false)}
        userEmail={userEmail}
        teamId={teamId}
        successUrl="/dashboard"
      />
    </>
  );
}
