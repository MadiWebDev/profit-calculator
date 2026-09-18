import Link from "next/link";
import {
  Sparkles, BarChart2, TrendingUp, ShoppingBag, Package,
  Users, FileText, Shield, Globe, Upload, Zap, ArrowRight,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Features — AI Profit Tracking for Ecommerce & Ads",
  description:
    "GetProfitCalc features: AI profit insights, multi-platform support (Shopify, WooCommerce, Etsy), what-if simulator, ad creative ROI, goal tracking, tax estimates, and more.",
  path: "/features",
});

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Profit Insights",
    badge: "Growth + Pro",
    desc: "Our AI reads your last 30 days of profit data and proactively surfaces insights in plain English: 'Your Meta ROAS dropped 18% this week while COGS on Product X rose — here's why your margin fell.' No other profit tracker in this price range offers this.",
    points: [
      "GPT-4o powered analysis of your actual business data",
      "Compares current vs. prior 30-day period automatically",
      "Breaks down by ad platform, product, and cost component",
      "Weekly digest on Growth; real-time on Pro",
    ],
  },
  {
    icon: Globe,
    title: "Multi-Platform Store Support",
    badge: "All Plans",
    desc: "Most profit trackers are Shopify-only. GetProfitCalc supports Shopify, WooCommerce, and Etsy via native OAuth integrations — plus CSV import for any platform with no native integration yet.",
    points: [
      "Shopify: OAuth connection, automatic order sync",
      "WooCommerce: REST API key connection",
      "Etsy: OAuth connection for shop orders",
      "CSV import: works with any platform — Amazon, BigCommerce, Ecwid, manual",
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
      "Breaks down ROAS, CPA, and net profit at ad/creative level",
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
    badge: "All Plans",
    desc: "Invite your VA, media buyer, or accountant. Each role has appropriate access — owners see everything, viewers see reports but can't edit COGS or billing.",
    points: [
      "Owner, Admin, Member, and Viewer roles",
      "Full audit log: who changed what, when",
      "Invite via email with 48-hour expiring tokens",
      "Remove team members instantly",
    ],
  },
  {
    icon: FileText,
    title: "White-Label Reports",
    badge: "Growth + Pro",
    desc: "One-click CSV (and PDF on Pro) reports for every data dimension: profit summary, order detail, product margins, ad spend ROI, and tax estimates.",
    points: [
      "Date range picker for any historical period",
      "Profit Summary, Order Detail, Product Margins, Ad Spend ROI, Tax Estimate",
      "CSV on all plans; PDF on Pro",
      "Designed to share with investors, accountants, or partners",
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
          <h2 className="text-3xl font-bold text-white mb-3">All features. 14-day free trial.</h2>
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
