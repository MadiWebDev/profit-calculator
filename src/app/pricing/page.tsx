"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle, X, Check, ArrowRight, HelpCircle, Zap, Shield, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_DISPLAY, INTERVAL_META, ALL_INTERVALS } from "@/lib/plans";
import type { BillingInterval, PlanKey } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

// ── Feature comparison table ─────────────────────────────────────────────────

interface PlanFeature {
  label:   string;
  starter: string | boolean;
  growth:  string | boolean;
  pro:     string | boolean;
  tooltip?: string;
}

const PLAN_FEATURES: PlanFeature[] = [
  { label: "Orders per month",            starter: "100",           growth: "1,000",        pro: "Unlimited" },
  { label: "Stores",                       starter: "1",             growth: "2",             pro: "Unlimited" },
  { label: "Ad platforms",                 starter: "1",             growth: "3",             pro: "All" },
  { label: "CSV import",                   starter: true,            growth: true,            pro: true },
  { label: "Shopify / WooCommerce / Etsy", starter: true,            growth: true,            pro: true },
  { label: "Order-level profit",           starter: true,            growth: true,            pro: true },
  { label: "Product margin view",          starter: true,            growth: true,            pro: true },
  { label: "What-if simulator",            starter: true,            growth: true,            pro: true },
  { label: "AI Profit Insights",           starter: false,           growth: "Weekly digest", pro: "Real-time" },
  { label: "Ad creative-level ROI",        starter: false,           growth: true,            pro: true },
  { label: "Profit goal tracking",         starter: true,            growth: true,            pro: true },
  { label: "Email alerts",                 starter: true,            growth: true,            pro: true },
  { label: "Slack alerts",                 starter: false,           growth: true,            pro: true },
  { label: "Tax set-aside estimator",      starter: true,            growth: true,            pro: true },
  { label: "CSV / PDF reports",            starter: "CSV only",      growth: true,            pro: true },
  { label: "Team members",                 starter: "2",             growth: "5",             pro: "Unlimited" },
  { label: "Public API + Zapier",          starter: false,           growth: false,           pro: true },
  { label: "Support",                      starter: "Email",         growth: "Email",         pro: "Priority chat" },
];

const FAQs = [
  {
    q: "When does the 7-day trial start?",
    a: "The moment you create your account. No credit card is required to start.",
  },
  {
    q: "What billing periods are available?",
    a: "You can pay monthly, every 3 months (save 10%), every 6 months (save 15%), or annually (save 20%). All options are available for every plan.",
  },
  {
    q: "What happens after the trial ends?",
    a: "Your account is archived — nothing is deleted, but the dashboard is locked until you choose a paid plan. Upgrading restores full access instantly.",
  },
  {
    q: "Can I change plans or billing periods at any time?",
    a: "Yes. Upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the next billing cycle.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards, plus PayPal where available. All payments are processed securely by Paddle.",
  },
  {
    q: "Is there a free forever plan?",
    a: "The free calculators at /calculators are always free. The SaaS dashboard has a 7-day trial; after that you need a paid plan.",
  },
  {
    q: "What does 'Unlimited orders' mean on Pro?",
    a: "No cap — import or sync as many orders as your store generates. No overage fees, ever.",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureCell({ value }: { value: string | boolean }) {
  if (value === true)  return <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 mx-auto" />;
  if (value === false) return <X     className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--color-border)] mx-auto" />;
  return <span className="text-xs sm:text-sm text-center block text-[var(--color-foreground)]">{value}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  const {
    getPrice, getTotalPrice, getCurrency,
    pricesLoaded, openCheckout, loading,
  } = usePaddleCheckout();

  const [activePlan, setActivePlan] = useState<PlanKey | null>(null);

  const handleStartPlan = async (plan: PlanKey) => {
    setActivePlan(plan);
    await openCheckout(plan, interval);
    setActivePlan(null);
  };

  const fmtMoney = (n: number, plan: PlanKey) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: getCurrency(plan, interval),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div className="bg-[var(--color-background)] overflow-x-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 md:py-20 text-center bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Badge variant="success" className="mb-4 text-xs font-semibold">
            7-day free trial · No credit card
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--color-foreground)] mb-4 leading-tight">
            Profit tracking that doesn&apos;t cost a fortune
          </h1>
          <p className="text-base sm:text-lg text-[var(--color-muted-foreground)] mb-3">
            GetProfitCalc is a <strong className="text-[var(--color-foreground)]">SaaS profit-tracking platform</strong> for ecommerce sellers.
            Connect your Shopify, WooCommerce, or Etsy store and get real-time, order-level profit visibility —
            including COGS, ad spend, platform fees, and AI-powered insights.
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-8">
            All plans start with a 7-day free trial. No credit card required.
          </p>

          {/* ── Billing interval selector ─────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-1 max-w-full">
            {ALL_INTERVALS.map((iv) => {
              const meta     = INTERVAL_META[iv];
              const isActive = interval === iv;
              return (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  className={cn(
                    "relative px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                      : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  )}
                >
                  {meta.label}
                  {meta.discountPct > 0 && (
                    <span
                      className={cn(
                        "ml-1 sm:ml-1.5 text-[10px] sm:text-xs font-bold",
                        isActive ? "text-green-600 dark:text-green-400" : "text-green-500/60"
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
      </section>

      {/* ── Plan cards ──────────────────────────────────────────────────────── */}
      <section className="pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {(["starter", "growth", "pro"] as PlanKey[]).map((plan) => {
            const isGrowth    = plan === "growth";
            const perMonth    = getPrice(plan, interval);
            const totalCharge = getTotalPrice(plan, interval);
            const meta        = INTERVAL_META[interval];
            const isLoading   = loading && activePlan === plan;

            return (
              <div
                key={plan}
                className={cn(
                  "rounded-2xl border-2 p-5 sm:p-6 flex flex-col relative",
                  isGrowth
                    ? "border-[var(--color-primary)] shadow-xl shadow-green-500/10 mt-3 sm:mt-0"
                    : "border-[var(--color-border)]",
                  "bg-[var(--color-card)]"
                )}
              >
                {isGrowth && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge variant="success" className="text-xs font-bold px-3 py-1">Most Popular</Badge>
                  </div>
                )}

                <div className="mb-5">
                  <h2 className="text-lg font-bold capitalize text-[var(--color-foreground)] mb-2">
                    {PLAN_DISPLAY[plan].name}
                  </h2>

                  {/* Per-month price */}
                  <div className="flex items-end gap-1 flex-wrap">
                    <span
                      className={cn(
                        "text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] transition-opacity break-all",
                        !pricesLoaded && "opacity-50"
                      )}
                    >
                      {fmtMoney(perMonth, plan)}
                    </span>
                    <span className="text-sm text-[var(--color-muted-foreground)] mb-2">/mo</span>
                  </div>

                  {/* Billing cadence */}
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                    {interval === "monthly" ? (
                      "billed monthly"
                    ) : (
                      <>
                        {fmtMoney(totalCharge, plan)} {meta.billedLabel}
                        {meta.discountPct > 0 && (
                          <span className="ml-1.5 font-semibold text-green-600 dark:text-green-400">
                            · save {meta.discountPct}%
                          </span>
                        )}
                      </>
                    )}
                  </p>

                  <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
                    {plan === "starter" && "Perfect for side-hustlers and early-stage stores."}
                    {plan === "growth"  && "For growing stores ready for real insights."}
                    {plan === "pro"     && "For scaling brands with no limits."}
                  </p>
                </div>

                {/* CTA — links to register for unauthenticated users */}
                <Button
                  asChild={!isLoading}
                  className="w-full mb-5 gap-1.5"
                  variant={isGrowth ? "default" : "outline"}
                  disabled={loading}
                  onClick={isLoading ? undefined : () => handleStartPlan(plan)}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Opening…
                    </span>
                  ) : (
                    <Link href="/auth/register">
                      Start Free Trial <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </Button>

                {/* Top feature list */}
                <ul className="space-y-2.5 flex-1">
                  {PLAN_FEATURES.slice(0, 9).map((f) => {
                    const val = f[plan];
                    if (val === false) return null;
                    return (
                      <li
                        key={f.label}
                        className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]"
                      >
                        <CheckCircle className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                        <span>
                          {f.label}
                          {typeof val === "string" && val !== "true" && (
                            <span className="text-[var(--color-foreground)] font-medium"> — {val}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Full feature comparison table ────────────────────────────────────── */}
      <section className="py-10 sm:py-12 bg-[var(--color-muted)] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-foreground)] text-center mb-6 sm:mb-8">
            Full Feature Comparison
          </h2>
          <div className="rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden">
            {/* Horizontal scroll wrapper keeps the table usable on narrow screens
                instead of squishing every column unreadably small. */}
            <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full min-w-[560px] text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[var(--color-card)] border-b border-[var(--color-border)]">
                    <th className="px-3 sm:px-5 py-3 sm:py-4 text-left font-semibold text-[var(--color-foreground)] w-2/5 sticky left-0 bg-[var(--color-card)]">
                      Feature
                    </th>
                    {(["starter", "growth", "pro"] as PlanKey[]).map((plan) => (
                      <th
                        key={plan}
                        className={cn(
                          "px-2 sm:px-4 py-3 sm:py-4 text-center font-bold capitalize whitespace-nowrap",
                          plan === "growth"
                            ? "text-[var(--color-primary)]"
                            : "text-[var(--color-foreground)]"
                        )}
                      >
                        {PLAN_DISPLAY[plan].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
                  {PLAN_FEATURES.map((row) => (
                    <tr key={row.label} className="hover:bg-[var(--color-muted)]/30">
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3 text-[var(--color-foreground)] flex items-center gap-1.5 sticky left-0 bg-[var(--color-card)]">
                        {row.label}
                        {row.tooltip && (
                          <span title={row.tooltip}>
                            <HelpCircle className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] flex-shrink-0" />
                          </span>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3"><FeatureCell value={row.starter} /></td>
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3"><FeatureCell value={row.growth}  /></td>
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3"><FeatureCell value={row.pro}     /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted-foreground)] text-center mt-2 sm:hidden">
            Swipe to see all plans →
          </p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-foreground)] text-center mb-6 sm:mb-8">
            Pricing FAQ
          </h2>
          <div className="space-y-4">
            {FAQs.map(({ q, a }) => (
              <div
                key={q}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5"
              >
                <h3 className="font-semibold text-[var(--color-foreground)] mb-2 text-sm sm:text-base">{q}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust bar ────────────────────────────────────────────────────────── */}
      <section className="py-6 border-t border-[var(--color-border)] bg-[var(--color-muted)]">
        <div className="mx-auto max-w-3xl px-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-6 text-xs text-[var(--color-muted-foreground)]">
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" /> Secure checkout via Paddle
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-500" /> Cancel anytime
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-500" /> 7-day free trial
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-500" /> No setup fees
          </span>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-[var(--color-primary)] px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Start free — no card required
          </h2>
          <p className="text-green-100 mb-6 text-sm sm:text-base">
            7-day free trial. Join sellers tracking real profit, not guessing it.
          </p>
          <Button asChild size="lg" variant="secondary" className="font-semibold px-8 gap-2 w-full sm:w-auto">
            <Link href="/auth/register">
              <Zap className="h-5 w-5" /> Start 7-Day Free Trial
            </Link>
          </Button>
        </div>
      </section>

      {/* ── Legal links — required for Paddle domain approval ────────────────── */}
      <section className="py-5 border-t border-[var(--color-border)] bg-[var(--color-muted)]">
        <div className="mx-auto max-w-3xl px-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted-foreground)]">
          <Link href="/terms-of-service" className="hover:text-[var(--color-foreground)] hover:underline transition-colors">
            Terms of Service
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy-policy" className="hover:text-[var(--color-foreground)] hover:underline transition-colors">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/refund-policy" className="hover:text-[var(--color-foreground)] hover:underline transition-colors">
            Refund Policy
          </Link>
          <span aria-hidden="true">·</span>
          <span>Payments processed by <a href="https://www.paddle.com" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-foreground)] hover:underline transition-colors">Paddle</a></span>
        </div>
      </section>
    </div>
  );
}