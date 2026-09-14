"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, X, Check, ArrowRight, HelpCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_DISPLAY } from "@/lib/plans";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "annual";

interface PlanFeature {
  label: string;
  starter: string | boolean;
  growth: string | boolean;
  pro: string | boolean;
  tooltip?: string;
}

const PLAN_FEATURES: PlanFeature[] = [
  { label: "Orders per month",       starter: "100",         growth: "1,000",       pro: "Unlimited" },
  { label: "Stores",                 starter: "1",           growth: "2",           pro: "Unlimited" },
  { label: "Ad platforms",           starter: "1",           growth: "3",           pro: "All" },
  { label: "CSV import",             starter: true,          growth: true,          pro: true },
  { label: "Shopify / WooCommerce / Etsy", starter: true,   growth: true,          pro: true },
  { label: "Order-level profit",     starter: true,          growth: true,          pro: true },
  { label: "Product margin view",    starter: true,          growth: true,          pro: true },
  { label: "What-if simulator",      starter: true,          growth: true,          pro: true },
  { label: "AI Profit Insights",     starter: false,         growth: "Weekly digest",pro: "Real-time" },
  { label: "Ad creative-level ROI",  starter: false,         growth: true,          pro: true },
  { label: "Profit goal tracking",   starter: true,          growth: true,          pro: true },
  { label: "Email alerts",           starter: true,          growth: true,          pro: true },
  { label: "Slack alerts",           starter: false,         growth: true,          pro: true },
  { label: "Tax set-aside estimator",starter: true,          growth: true,          pro: true },
  { label: "CSV / PDF reports",      starter: "CSV only",    growth: true,          pro: true },
  { label: "Team members",           starter: "2",           growth: "5",           pro: "Unlimited" },
  { label: "Public API + Zapier",    starter: false,         growth: false,         pro: true },
  { label: "Support",                starter: "Email",        growth: "Email",       pro: "Priority chat" },
];

const FAQs = [
  { q: "When does the 7-day trial start?", a: "The moment you create your account. No credit card is required to start." },
  { q: "What happens after the trial ends?", a: "Your account is archived — nothing is deleted, but the dashboard is locked until you choose a paid plan. Upgrading restores full access instantly." },
  { q: "Can I change plans at any time?", a: "Yes. Upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the next billing cycle." },
  { q: "What payment methods do you accept?", a: "All major credit and debit cards. Processed securely by Paddle." },
  { q: "Is there a free forever plan?", a: "The free calculators at /calculators are always free. The SaaS dashboard has a 7-day trial; after that you need a paid plan to continue syncing data." },
  { q: "What does 'Unlimited orders' mean on Pro?", a: "No cap — import or sync as many orders as your store generates. No overage fees, ever." },
];

function FeatureCell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="h-5 w-5 text-green-500 mx-auto" />;
  if (value === false) return <X className="h-5 w-5 text-[var(--color-border)] mx-auto" />;
  return <span className="text-sm text-center block text-[var(--color-foreground)]">{value}</span>;
}

export default function PricingPage() {
  const [interval, setInterval] = useState<Interval>("monthly");

  const price = (plan: keyof typeof PLAN_DISPLAY) =>
    interval === "annual" ? PLAN_DISPLAY[plan].annualPrice : PLAN_DISPLAY[plan].price;

  return (
    <div className="bg-[var(--color-background)]">
      {/* Header */}
      <section className="py-16 sm:py-20 text-center bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Badge variant="success" className="mb-4 text-xs font-semibold">7-day free trial · No credit card</Badge>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] mb-4">
            Profit tracking that doesn&apos;t cost a fortune
          </h1>
          <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
            All plans start with a 7-day free trial. No credit card required.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] p-1">
            {(["monthly", "annual"] as Interval[]).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition-colors capitalize",
                  interval === i
                    ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                )}
              >
                {i}
                {i === "annual" && (
                  <span className="ml-1.5 text-xs text-green-600 dark:text-green-400 font-semibold">-20%</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-6">
          {(["starter", "growth", "pro"] as const).map((plan) => {
            const isGrowth = plan === "growth";
            return (
              <div
                key={plan}
                className={cn(
                  "rounded-2xl border-2 p-6 flex flex-col",
                  isGrowth
                    ? "border-[var(--color-primary)] shadow-xl shadow-green-500/10 relative"
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
                  <h2 className="text-lg font-bold capitalize text-[var(--color-foreground)] mb-2">{plan}</h2>
                  <div className="flex items-end gap-1">
                    <span className="text-5xl font-extrabold text-[var(--color-foreground)]">${price(plan).toFixed(2)}</span>
                    <span className="text-sm text-[var(--color-muted-foreground)] mb-2">/mo</span>
                  </div>
                  {interval === "annual" && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      billed ${(price(plan) * 12).toFixed(0)}/year
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
                    {plan === "starter" && "Perfect for side-hustlers and early-stage stores."}
                    {plan === "growth" && "For growing stores ready for real insights."}
                    {plan === "pro" && "For scaling brands with no limits."}
                  </p>
                </div>
                <Button asChild className="w-full mb-5" variant={isGrowth ? "default" : "outline"}>
                  <Link href="/auth/register">
                    Start Free Trial <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
                <ul className="space-y-2.5 flex-1">
                  {PLAN_FEATURES.slice(0, 9).map((f) => {
                    const val = f[plan];
                    if (val === false) return null;
                    return (
                      <li key={f.label} className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]">
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

      {/* Full feature comparison table */}
      <section className="py-12 bg-[var(--color-muted)] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] text-center mb-8">Full Feature Comparison</h2>
          <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-card)] border-b border-[var(--color-border)]">
                  <th className="px-5 py-4 text-left font-semibold text-[var(--color-foreground)] w-2/5">Feature</th>
                  {(["starter", "growth", "pro"] as const).map((plan) => (
                    <th key={plan} className={cn("px-4 py-4 text-center font-bold capitalize", plan === "growth" ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]")}>
                      {plan}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
                {PLAN_FEATURES.map((row) => (
                  <tr key={row.label} className="hover:bg-[var(--color-muted)]/30">
                    <td className="px-5 py-3 text-[var(--color-foreground)] flex items-center gap-1.5">
                      {row.label}
                      {row.tooltip && (
                        <span title={row.tooltip}>
                          <HelpCircle className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><FeatureCell value={row.starter} /></td>
                    <td className="px-4 py-3"><FeatureCell value={row.growth} /></td>
                    <td className="px-4 py-3"><FeatureCell value={row.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] text-center mb-8">Pricing FAQ</h2>
          <div className="space-y-4">
            {FAQs.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
                <h3 className="font-semibold text-[var(--color-foreground)] mb-2">{q}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[var(--color-primary)]">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Start free — no card required</h2>
          <p className="text-green-100 mb-6">7-day free trial. Join sellers tracking real profit, not guessing it.</p>
          <Button asChild size="lg" variant="secondary" className="font-semibold px-8 gap-2">
            <Link href="/auth/register">
              <Zap className="h-5 w-5" /> Start 7-Day Free Trial
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
