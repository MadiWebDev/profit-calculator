import Link from "next/link";
import {
  Sparkles, TrendingUp, ShoppingBag, Package,
  Users, FileText, Globe, Upload, Zap, ArrowRight,
  CheckCircle, BarChart3, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Features — AI Profit Tracking for Ecommerce & Ads",
  description:
    "GetProfitCalc features: AI profit insights, product and customer intelligence, guardrails and alerts, multi-currency FX, Shopify support, what-if simulator, ad creative ROI, goal tracking, tax estimates, and more.",
  path: "/features",
});

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Profit Insights",
    badge: "Growth + Pro",
    desc: "Our AI reads your last 30 days of profit data and proactively surfaces insights in plain English: 'Your Meta ROAS dropped 18% this week while COGS on Product X rose — here's why your margin fell.'",
    points: [
      "AI analysis of your actual business data, via OpenRouter or Groq",
      "Compares current vs. prior 30-day period automatically",
      "Breaks down by ad platform, product, and cost component",
      "Flags anomalies and forecasts the next 30 days of revenue",
      "Weekly digest on Growth; real-time on Pro",
    ],
  },
  {
    icon: Globe,
    title: "Shopify + CSV Import",
    badge: "All Plans",
    desc: "GetProfitCalc is Shopify-only by design: native Shopify OAuth plus CSV import for any platform with no native integration yet.",
    points: [
      "Shopify: OAuth connection, automatic order sync",
      "Shopify webhooks: real-time order updates",
      "CSV import: historical orders from any platform — Amazon, BigCommerce, Ecwid, manual",
    ],
  },
  {
    icon: TrendingUp,
    title: "What-If Pricing Simulator",
    badge: "All Plans",
    desc: "Before you raise prices, cut ad spend, or negotiate a better supplier rate — see the projected impact on your profit margin instantly. Drag sliders and watch the numbers update in real time.",
    points: [
      "Adjust selling price, COGS, ad spend, fees, refund rate simultaneously",
      "See profit per unit, total monthly profit, ROI, and break-even price",
      "Bar chart shows per-unit cost breakdown visually",
      "No data saved — a pure forward-looking planning tool",
    ],
  },
  {
    icon: ShoppingBag,
    title: "Ad Creative–Level Profit",
    badge: "Growth + Pro",
    desc: "Campaign-level ROAS is a vanity metric. GetProfitCalc shows you which specific ad creative is profitable after deducting COGS, shipping, and fees — not just which generated the most revenue.",
    points: [
      "Connects to Meta Ads, Google Ads, and TikTok Ads",
      "Breaks down ROAS, CPA, and net profit at campaign level, and at creative level where the data supports it",
      "Automatically attributes ad spend to orders",
      "Identifies your worst-performing creatives draining margin",
    ],
  },
  {
    icon: Package,
    title: "Tax Set-Aside Estimator",
    badge: "All Plans",
    desc: "One of the most under-served pain points for small sellers: not knowing how much to set aside for taxes. GetProfitCalc estimates your quarterly tax obligation based on net profit.",
    points: [
      "Configurable effective tax rate (default 28%)",
      "Shows quarterly payment estimate and after-tax profit",
      "Downloadable as CSV for your accountant",
      "Disclaimer: estimate only — always consult a tax professional",
    ],
  },
  {
    icon: Users,
    title: "Team Roles & Permissions",
    badge: "Growth + Pro",
    desc: "Invite your VA, media buyer, or accountant on Growth and Pro. Starter is solo use — no team invites. Each role has appropriate access — owners see everything, viewers see reports but can't edit COGS or billing.",
    points: [
      "Owner, Admin, Member, and Viewer roles",
      "Full audit log: who changed what, when",
      "Invite via email with expiring tokens",
      "Remove team members instantly",
      "Growth includes 1 team member, Pro includes 5",
    ],
  },
  {
    icon: FileText,
    title: "Reports & Exports",
    badge: "All Plans",
    desc: "One-click CSV and PDF reports for every data dimension: profit summary, order detail, product margins, ad spend ROI, and tax estimates.",
    points: [
      "Date range picker for any historical period",
      "Profit Summary, Order Detail, Product Margins, Ad Spend ROI, Tax Estimate",
      "CSV on all plans; PDF on Growth and Pro",
      "Designed to share with investors, accountants, or partners",
    ],
  },
  {
    icon: BarChart3,
    title: "Product & Customer Intelligence",
    badge: "All Plans",
    desc: "Know which products actually make money after every cost, and which customers are worth keeping. Rankings, break-even prices, and customer segments are computed from your real orders — not sample data.",
    points: [
      "Products ranked by fully-loaded profit, not just revenue",
      "Break-even price and maximum discount before a product loses money",
      "30-day rising, falling, and dead movers",
      "Customer RFM segments: champions, loyal, new, at-risk, and lost",
    ],
  },
  {
    icon: Bell,
    title: "Guardrails & Alerts",
    badge: "All Plans",
    desc: "Set a floor and let GetProfitCalc watch it. When margin, refunds, returns-to-origin, or average order profit cross a threshold you chose, you get an alert instead of discovering it in next month's numbers.",
    points: [
      "Threshold rules on margin, refunds, RTO, and average order profit",
      "Checked automatically every day",
      "24-hour notification cooldown, so one bad day doesn't spam you",
      "Alerts surface in your dashboard when a rule trips",
    ],
  },
  {
    icon: Globe,
    title: "Multi-Currency & Real-Time FX",
    badge: "All Plans",
    desc: "Sell in one currency, report in another, without sums that mix currencies 1:1. Every order is converted to your team's base currency before any total is computed.",
    points: [
      "Exchange rates via currencyapi.net, with fallback to free rates and stale cached rates",
      "Reports, P&L, and product margins all in one base currency",
      "No mixed-currency totals — conversion happens before aggregation",
      "Currency settings live in your dashboard, per workspace",
    ],
  },
  {
    icon: Upload,
    title: "CSV Import — Any Platform",
    badge: "All Plans",
    desc: "If your platform isn't natively supported yet, upload a CSV export. We accept a standard format and map all cost components for accurate per-order profit calculation.",
    points: [
      "Downloadable CSV template with all expected columns",
      "Supports gross revenue, COGS, shipping, fees, refunds, ad spend allocation",
      "Upserts orders — safe to re-import updated files",
      "Immediately visible in dashboard after import",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="bg-[var(--color-background)]">
      {/* Hero */}
      <section className="py-16 sm:py-20 text-center bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Badge variant="success" className="mb-4">Built for real sellers</Badge>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] mb-4">
            Every feature your profit tracking needs
          </h1>
          <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
            We built the features other tools charge $249/month for. Here&apos;s exactly what you get.
          </p>
          <Button asChild size="lg" className="gap-2">
            <Link href="/auth/register">Start Free Trial <ArrowRight className="h-5 w-5" /></Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-16">
          {FEATURES.map(({ icon: Icon, title, badge, desc, points }, i) => (
            <div
              key={title}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-start ${i % 2 === 1 ? "lg:flex-row-reverse" : ""}`}
            >
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                    <Icon className="h-6 w-6" />
                  </span>
                  <Badge variant="outline" className="text-xs">{badge}</Badge>
                </div>
                <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-3">{title}</h2>
                <p className="text-[var(--color-muted-foreground)] leading-relaxed mb-5">{desc}</p>
                <ul className="space-y-2.5">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-[var(--color-muted-foreground)]">
                      <CheckCircle className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cn(
                "rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)] p-8 flex items-center justify-center min-h-[200px]",
                i % 2 === 1 ? "lg:order-1" : ""
              )}>
                <div className="text-center">
                  <Icon className="h-16 w-16 text-[var(--color-primary)]/30 mx-auto mb-3" />
                  <p className="text-sm text-[var(--color-muted-foreground)]">{title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[var(--color-primary)]">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">All features. 7-day free trial.</h2>
          <p className="text-green-100 mb-6">No credit card required. Cancel anytime.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" variant="secondary" className="font-semibold gap-2">
              <Link href="/auth/register"><Zap className="h-5 w-5" /> Start Free Trial</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="font-semibold border-white/40 text-white hover:bg-white/10">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}
