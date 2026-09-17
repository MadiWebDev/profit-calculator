"use client";

/**
 * ArchivedWall
 * ─────────────
 * Full-page gate rendered when a user's trial has expired and they have no
 * active paid subscription. It is the ONLY thing the layout renders when the
 * account is archived — there is no dashboard content underneath it (the
 * server component returns early before rendering children).
 *
 * Security notes:
 * - No dashboard HTML is in the DOM — DevTools element deletion reveals nothing.
 * - All data API routes independently return 402 for archived accounts, so
 *   raw fetch() calls from the console are also blocked server-side.
 * - The PricingModal is rendered with dismissible={false} so Escape / outside
 *   click cannot close it, preventing a stuck state with no upgrade CTA.
 */

import { useState } from "react";
import { Lock, Clock, Zap, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { PricingModal } from "@/components/billing/PricingModal";

interface ArchivedWallProps {
  /** ISO string or Date of when the trial ended */
  trialEndedAt?: Date | string | null;
  /** User's display name for personalisation */
  userName?: string;
}

export function ArchivedWall({ trialEndedAt, userName }: ArchivedWallProps) {
  const [pricingOpen, setPricingOpen] = useState(false);

  const endDate = trialEndedAt ? new Date(trialEndedAt) : null;
  const formattedDate = endDate
    ? endDate.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <>
      {/*
        Full-page layout — not a CSS overlay. The layout server component
        returns ONLY this component when isArchived is true, so there is
        nothing else in the DOM to un-hide via DevTools.
      */}
      <div
        role="main"
        aria-labelledby="archived-wall-heading"
        className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] px-4 py-12"
      >
        {/* Card */}
        <div className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl p-8 flex flex-col items-center text-center gap-6">

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
            <h1
              id="archived-wall-heading"
              className="text-2xl font-extrabold text-[var(--color-foreground)]"
            >
              {userName ? `${userName.split(" ")[0]}, your` : "Your"} free trial has ended
            </h1>
            {formattedDate && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Your 7-day trial expired on{" "}
                <span className="font-medium text-[var(--color-foreground)]">
                  {formattedDate}
                </span>
                .
              </p>
            )}
            <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
              Your data is safe and waiting. Upgrade to any plan to instantly
              restore full access — no data loss, no setup required.
            </p>
          </div>

          {/* What they're missing */}
          <ul className="w-full space-y-2 text-left" aria-label="Included with a paid plan">
            {[
              "Order-level profit & margin tracking",
              "Real-time store syncing",
              "Ad spend ROI & attribution",
              "Profit goals & AI insights",
            ].map((f) => (
              <li
                key={f}
                className="flex items-center gap-3 text-sm text-[var(--color-muted-foreground)]"
              >
                <span
                  className="h-5 w-5 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0"
                  aria-hidden="true"
                >
                  <Zap className="h-3 w-3 text-[var(--color-primary)]" />
                </span>
                {f}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="w-full space-y-3">
            <Button
              className="w-full gap-2 text-base py-5"
              onClick={() => setPricingOpen(true)}
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              View Plans &amp; Upgrade
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

        {/* Fine print */}
        <p className="mt-6 text-xs text-[var(--color-muted-foreground)] text-center max-w-xs">
          All your historical data is preserved. Upgrading restores full access
          immediately.
        </p>
      </div>

      {/*
        PricingModal — dismissible={false} so Escape and outside-click cannot
        close it. The user must either upgrade or sign out.
      */}
      <PricingModal
        open={pricingOpen}
        dismissible={false}
        onClose={() => setPricingOpen(false)}
      />
    </>
  );
}
