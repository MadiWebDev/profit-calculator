/**
 * /welcome — post-checkout success page
 *
 * Paddle redirects here after a successful payment (settings.successUrl).
 * It is also the target of the checkout.completed eventCallback redirect.
 *
 * Shows a brief confirmation and routes the user to their dashboard.
 * No sensitive data is displayed; Paddle appends _ptxn / _pcheckout query
 * params for its own verification — we ignore them here.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, ArrowRight, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Welcome — GetProfitCalc",
  description: "Your subscription is active. Let's get started.",
  // Prevent search engines from indexing the post-checkout page
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-16 bg-[var(--color-background)]">
      <div className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl p-8 sm:p-10 flex flex-col items-center text-center gap-6">

        {/* Success icon */}
        <div
          className="h-20 w-20 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center"
          aria-hidden="true"
        >
          <CheckCircle className="h-10 w-10 text-[var(--color-primary)]" />
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-foreground)]">
            You&apos;re all set!
          </h1>
          <p className="text-sm sm:text-base text-[var(--color-muted-foreground)] leading-relaxed">
            Your subscription is now active. Head to your dashboard to connect
            your store and start tracking real profit.
          </p>
        </div>

        {/* What's next */}
        <ul
          className="w-full space-y-2 text-left"
          aria-label="Next steps"
        >
          {[
            "Connect your Shopify, WooCommerce, or Etsy store",
            "Import your products and set COGS",
            "Link your ad platforms to track ROI",
            "Explore your real-time profit dashboard",
          ].map((step) => (
            <li
              key={step}
              className="flex items-start gap-3 text-sm text-[var(--color-muted-foreground)]"
            >
              <span
                className="h-5 w-5 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <ArrowRight className="h-3 w-3 text-[var(--color-primary)]" />
              </span>
              {step}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Button asChild className="w-full gap-2 text-base py-5">
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Go to Dashboard
          </Link>
        </Button>
      </div>

      {/* Fine print */}
      <p className="mt-6 text-xs text-[var(--color-muted-foreground)] text-center max-w-xs">
        A receipt has been sent to your email by Paddle. You can manage your
        subscription anytime from{" "}
        <Link
          href="/dashboard/settings"
          className="underline underline-offset-2 hover:text-[var(--color-foreground)] transition-colors"
        >
          Settings → Billing
        </Link>
        .
      </p>
    </div>
  );
}
