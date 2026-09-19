import Link from "next/link";
import {
  ArrowRight, BarChart2, Shield, Zap, Globe, Star,
  CheckCircle, X, Check, Sparkles, TrendingUp,
  ShoppingBag, Package, Users, FileText,
} from "lucide-react";
import { calculators } from "@/config/calculators";
import { CalculatorCard } from "@/components/CalculatorCard";
import { AdSlot } from "@/components/AdSlot";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Free Profit Calculators + Real-Time Profit Tracking for Ecommerce",
  description:
    "Free profit calculators for Shopify, Amazon FBA, dropshipping, and ads — plus a full SaaS profit tracking platform starting at $3/month. Know your real numbers.",
  path: "/",
});

// ── Data ──────────────────────────────────────────────────────────────────────

const trustBadges = [
  { icon: Zap,      label: "Real-Time Results",     desc: "Calculates as you type" },
  { icon: Shield,   label: "100% Free Calculators", desc: "No account required" },
  { icon: Globe,    label: "Multi-Currency",         desc: "USD, EUR, GBP, INR & more" },
  { icon: BarChart2,label: "Visual Breakdowns",      desc: "Charts on every calculator" },
];

const comparisonRows: {
  feature: string;
  us: string | boolean;
  them: string | boolean;
}[] = [
  { feature: "Starting price",              us: "$3/month",   them: "$39/month" },
  { feature: "Free trial (no credit card)", us: true,         them: false },
  { feature: "Shopify integration",         us: true,         them: true },
  { feature: "WooCommerce integration",     us: true,         them: false },
  { feature: "Etsy integration",            us: true,         them: false },
  { feature: "CSV import (any platform)",   us: true,         them: false },
  { feature: "AI profit insights",          us: true,         them: false },
  { feature: "What-if simulator",           us: true,         them: false },
  { feature: "Ad creative-level profit",    us: true,         them: false },
  { feature: "Profit goal + alerts",        us: true,         them: false },
  { feature: "Tax set-aside estimator",     us: true,         them: false },
  { feature: "Team roles & permissions",    us: true,         them: "Paid add-on" },
  { feature: "Free calculators hub",        us: true,         them: false },
];

const features = [
  { icon: Sparkles,   title: "AI Profit Insights",       desc: "GPT-4 reads your data and tells you exactly why your margin dropped and what to fix. No other profit tracker has this." },
  { icon: BarChart2,  title: "Multi-Platform Tracking",  desc: "Shopify, WooCommerce, Etsy, or any platform via CSV. Not locked to one ecosystem." },
  { icon: TrendingUp, title: "What-If Simulator",        desc: "Drag a slider to simulate a price increase, COGS change, or ad spend cut — see projected profit before you commit." },
  { icon: ShoppingBag,title: "Ad Creative Profitability",desc: "See which specific ad creative is actually profitable after COGS, not just which has the best ROAS." },
  { icon: Package,    title: "Tax Set-Aside Estimator",  desc: "Rough quarterly tax estimate based on net profit. Stop being surprised at tax time." },
  { icon: Users,      title: "Team Roles",               desc: "Invite your VA, agency, or accountant with view-only access. Full audit log of every change." },
  { icon: FileText,   title: "White-Label Reports",      desc: "One-click branded CSV reports for investors, accountants, or your own records." },
  { icon: Shield,     title: "Starts at $3/month",       desc: "100-order starter plan for side-hustlers. Growth at $9. Pro unlimited at $25. No $39–$249 price shock." },
];

const testimonials = [
  { name: "Sarah K.", role: "Shopify Store Owner", avatar: "SK", text: "Finally a calculator that includes Shopify fees AND ad spend. I discovered my 'profitable' product was losing me $3 per sale.", stars: 5 },
  { name: "Marcus T.", role: "Dropshipping Entrepreneur", avatar: "MT", text: "The monthly profit projector is a game-changer. Scaled from 50 to 400 orders/month using the break-even price as my floor.", stars: 5 },
  { name: "Priya M.", role: "WooCommerce Seller", avatar: "PM", text: "The AI insights feature caught a 18% margin drop before I even noticed. Turned out my supplier raised prices and I didn't re-check COGS.", stars: 5 },
];

const faqs = [
  { q: "Are the calculators really free?", a: "Yes — every calculator on GetProfitCalc is completely free, forever. No account needed, no limits, no credit card." },
  { q: "What's the difference between the free calculators and the SaaS platform?", a: "The free calculators are one-off tools you use manually. The SaaS platform connects to your actual store and automatically tracks every order's real profit in real time, with AI insights, goal tracking, and reports." },
  { q: "Do I need a credit card to start the 7-day trial?", a: "No. Sign up with just your email. No credit card is required until you choose to upgrade after your trial ends." },
  { q: "Which platforms does the profit tracker support?", a: "Shopify (OAuth), WooCommerce (API keys), Etsy (OAuth), and any other platform via CSV import. More native integrations are being added regularly." },
  { q: "How does AI Insights work?", a: "We send your aggregated profit data (no personal customer info) to OpenAI's GPT-4, which generates 3 proactive insights about your business. Available on Growth and Pro plans." },
  { q: "Can I import historical orders?", a: "Yes. Use our CSV import on any plan to upload historical order data. We provide a template with all the columns we expect." },
];

// ── Components ────────────────────────────────────────────────────────────────

function ComparisonCell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 mx-auto" />;
  if (value === false) return <X className="h-4 w-4 sm:h-5 sm:w-5 text-red-400 mx-auto" />;
  return <span className="text-xs sm:text-sm text-[var(--color-muted-foreground)] whitespace-nowrap">{value}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const featuredCalcs = calculators.slice(0, 6);

  return (
    <div className="overflow-x-hidden">
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)] pt-12 pb-14 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <Badge variant="success" className="mb-5 text-xs font-semibold">
            Free Calculators · SaaS Platform from $3/mo · No Credit Card Trial
          </Badge>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[var(--color-foreground)] tracking-tight mb-6 leading-tight">
            Know Your Real{" "}
            <span className="text-[var(--color-primary)]">Profit</span>
            <br className="hidden sm:block" />
            Before You Spend a Dime
          </h1>
          <p className="max-w-2xl mx-auto text-base sm:text-xl text-[var(--color-muted-foreground)] mb-4 leading-relaxed">
            Free profit calculators for every business model. Plus a full profit-tracking SaaS that actually costs less than a coffee subscription — starting at <strong className="text-[var(--color-foreground)]">$3/month</strong>.
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-8">
            Real Shopify profit tracking, without the <s>$39–$349/month</s> price tag.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto text-base font-semibold px-8 gap-2">
              <Link href="/auth/register">
                Start Free 7-Day Trial <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto text-base">
              <Link href="/calculators">Use Free Calculators</Link>
            </Button>
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-4">
            No credit card required · Cancel anytime · 7-day free trial
          </p>
        </div>
      </section>

      {/* ── TRUST BADGES ──────────────────────────────────────────────── */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-muted)] py-6 sm:py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {trustBadges.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 text-center sm:text-left">
                <span className="flex-shrink-0 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-[var(--color-foreground)]">{label}</p>
                  <p className="text-[11px] sm:text-xs text-[var(--color-muted-foreground)]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ─────────────────────────────────────────────── */}
      <section className="py-12 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12">
            <Badge variant="outline" className="mb-3">Why GetProfitCalc Wins</Badge>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-foreground)] mb-3">
              Everything TrueProfit has. Plus what they don&apos;t.
            </h2>
            <p className="text-sm sm:text-base text-[var(--color-muted-foreground)] max-w-xl mx-auto">
              We built the features other profit trackers charge $349/month for — and priced them for real sellers.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 hover:border-[var(--color-primary)]/40 transition-colors">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] mb-3">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-[var(--color-foreground)] mb-1.5">{title}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ──────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-[var(--color-muted)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-foreground)] mb-2">GetProfitCalc vs. Other Profit Trackers</h2>
            <p className="text-[var(--color-muted-foreground)] text-sm">A fair, factual comparison. Last updated September 2026.</p>
          </div>
          {/*
            Phones (<sm): a stacked card per row — feature name on top, then
            GetProfitCalc vs Others side by side as labelled chips. No
            horizontal scrolling, nothing gets squished.
          */}
          <div className="sm:hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)] overflow-hidden shadow-sm">
            {comparisonRows.map(({ feature, us, them }) => (
              <div key={feature} className="px-4 py-3">
                <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">{feature}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[var(--color-primary)]/5 px-2 py-1.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)] mb-1">
                      GetProfitCalc
                    </p>
                    <ComparisonCell value={us} />
                  </div>
                  <div className="rounded-lg bg-[var(--color-muted)] px-2 py-1.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)] mb-1">
                      Others
                    </p>
                    <ComparisonCell value={them} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tablet and up: the full table, safely scrollable as a fallback. */}
          <div className="hidden sm:block rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="bg-[var(--color-card)] border-b border-[var(--color-border)]">
                    <th className="px-5 py-4 text-left font-semibold text-[var(--color-foreground)]">Feature</th>
                    <th className="px-5 py-4 text-center font-bold text-[var(--color-primary)] whitespace-nowrap">GetProfitCalc</th>
                    <th className="px-5 py-4 text-center font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap">Others</th>
                  </tr>
                </thead>
                <tbody className="bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
                  {comparisonRows.map(({ feature, us, them }) => (
                    <tr key={feature} className="hover:bg-[var(--color-muted)]/40">
                      <td className="px-5 py-3 text-[var(--color-foreground)]">{feature}</td>
                      <td className="px-5 py-3 text-center"><ComparisonCell value={us} /></td>
                      <td className="px-5 py-3 text-center"><ComparisonCell value={them} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-center text-[var(--color-muted-foreground)] mt-3">
            &ldquo;Others&rdquo; represents typical pricing/features of leading profit tracking tools as of September 2026.
          </p>
        </div>
      </section>

      {/* ── PRICING PREVIEW ───────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-8 sm:mb-10">
            <Badge variant="outline" className="mb-3">Simple Pricing</Badge>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-foreground)] mb-3">
              Starts at <span className="text-[var(--color-primary)]">$3/month</span>
            </h2>
            <p className="text-sm sm:text-base text-[var(--color-muted-foreground)] max-w-xl mx-auto">
              No $39–$349/month price shock. All plans include a 7-day free trial with no credit card required.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
            {/* Starter */}
            <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6 flex flex-col">
              <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-1">Starter</h3>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-[var(--color-foreground)]">$3</span>
                <span className="text-sm text-[var(--color-muted-foreground)] mb-1">/month</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-4">Perfect for side-hustlers and early-stage stores.</p>
              <ul className="space-y-2 mb-6 flex-1">
                {["100 orders/month", "1 store", "Shopify / WooCommerce / Etsy", "CSV import", "Order-level profit", "What-if simulator", "Profit goal tracking", "2 team members"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]">
                    <CheckCircle className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/register">Start Free Trial</Link>
              </Button>
            </div>

            {/* Growth — highlighted */}
            <div className="rounded-2xl border-2 border-[var(--color-primary)] bg-[var(--color-card)] p-5 sm:p-6 flex flex-col relative shadow-xl shadow-green-500/10 mt-3 sm:mt-0">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <Badge variant="success" className="text-xs font-bold px-3 py-1">Most Popular</Badge>
              </div>
              <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-1">Growth</h3>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-[var(--color-foreground)]">$9</span>
                <span className="text-sm text-[var(--color-muted-foreground)] mb-1">/month</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-4">For growing stores ready for real insights.</p>
              <ul className="space-y-2 mb-6 flex-1">
                {["1,000 orders/month", "2 stores", "Everything in Starter", "AI Profit Insights (weekly)", "Ad creative-level ROI", "3 ad platforms", "Slack alerts", "5 team members"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]">
                    <CheckCircle className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild className="w-full">
                <Link href="/auth/register">Start Free Trial</Link>
              </Button>
            </div>

            {/* Pro */}
            <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6 flex flex-col">
              <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-1">Pro</h3>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-[var(--color-foreground)]">$25</span>
                <span className="text-sm text-[var(--color-muted-foreground)] mb-1">/month</span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-4">For scaling brands with no limits.</p>
              <ul className="space-y-2 mb-6 flex-1">
                {["Unlimited orders", "Unlimited stores", "Everything in Growth", "Real-time AI Insights", "All ad platforms", "Public API + Zapier", "White-label reports", "Priority chat support"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]">
                    <CheckCircle className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/register">Start Free Trial</Link>
              </Button>
            </div>
          </div>

          <p className="text-center text-xs text-[var(--color-muted-foreground)] mt-5">
            Save up to 20% with annual billing.{" "}
            <Link href="/pricing" className="underline underline-offset-2 hover:text-[var(--color-foreground)]">
              See full pricing details →
            </Link>
          </p>
        </div>
      </section>

      {/* ── AD SLOT ───────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 pb-8 flex justify-center overflow-x-auto">
        <AdSlot position="leaderboard" />
      </div>

      {/* ── FREE CALCULATORS GRID ─────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-[var(--color-muted)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10">
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-foreground)] mb-3">
              Free Profit Calculators
            </h2>
            <p className="text-sm sm:text-base text-[var(--color-muted-foreground)] max-w-xl mx-auto">
              No account needed. Use any calculator instantly for free.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredCalcs.map((config) => (
              <CalculatorCard key={config.slug} config={config} />
            ))}
          </div>
          <div className="text-center mt-8">
            <Button asChild variant="outline">
              <Link href="/calculators">View All {calculators.length} Free Calculators</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────────────── */}
      <section className="py-12 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-foreground)] mb-3">What Sellers Are Saying</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6">
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-[var(--color-muted-foreground)] mb-4 leading-relaxed italic">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-xs font-bold flex-shrink-0">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">{t.name}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-[var(--color-muted)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-foreground)] mb-6 sm:mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
                <h3 className="font-semibold text-[var(--color-foreground)] mb-2 text-sm sm:text-base">{q}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-[var(--color-primary)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Ready to see your real profit?</h2>
          <p className="text-green-100 mb-6 text-base sm:text-lg">
            7-day free trial. No credit card. Connect your store in under 2 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" variant="secondary" className="font-semibold text-base px-8 w-full sm:w-auto">
              <Link href="/auth/register">
                Start Free Trial <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="font-semibold text-base border-white/40  w-full sm:w-auto">
              <Link href="/calculators">Use Free Calculators</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}