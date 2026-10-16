import Link from "next/link";
import { Check, X, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "GetProfitCalc vs TrueProfit — Honest Comparison",
  description:
    "How does GetProfitCalc compare to TrueProfit, BeProfit, and other profit tracking tools? Side-by-side comparison of features, pricing, and platform support.",
  path: "/compare/getprofitcalc",
});

interface CompRow {
  category: string;
  feature: string;
  us: string | boolean;
  them: string | boolean;
  note?: string;
}

const ROWS: CompRow[] = [
  // Pricing
  { category: "Pricing", feature: "Starting price",                   us: "$3/month",         them: "$39–$49/month" },
  { category: "Pricing", feature: "Free trial (no credit card)",       us: true,               them: false,             note: "Most require Shopify billing approval" },
  { category: "Pricing", feature: "Unlimited-order plan price",        us: "$25/month",        them: "$99–$249/month" },
  { category: "Pricing", feature: "Annual discount",                   us: "20%",              them: "Varies" },

  // Integrations
  { category: "Integrations", feature: "Shopify",                     us: true,               them: true },
  { category: "Integrations", feature: "WooCommerce",                 us: true,               them: false },
  { category: "Integrations", feature: "Etsy",                        us: true,               them: false },
  { category: "Integrations", feature: "CSV import (any platform)",   us: true,               them: false },
  { category: "Integrations", feature: "Meta Ads",                    us: true,               them: true },
  { category: "Integrations", feature: "Google Ads",                  us: true,               them: true },
  { category: "Integrations", feature: "TikTok Ads",                  us: true,               them: "Some plans" },

  // Features
  { category: "Features", feature: "Order-level true net profit",      us: true,               them: true },
  { category: "Features", feature: "Product/SKU-level margins",        us: true,               them: true },
  { category: "Features", feature: "Ad creative–level profit",         us: true,               them: "Campaign only" },
  { category: "Features", feature: "AI profit insights",               us: true,               them: false },
  { category: "Features", feature: "What-if pricing simulator",        us: true,               them: false },
  { category: "Features", feature: "Profit goal + email alerts",       us: true,               them: false },
  { category: "Features", feature: "Tax set-aside estimator",          us: true,               them: false },
  { category: "Features", feature: "CSV / PDF reports",                us: true,               them: "Some plans" },
  { category: "Features", feature: "Free calculators hub",             us: true,               them: false },

  // Team & Access
  { category: "Team & Access", feature: "Team roles & permissions",    us: true,               them: "Higher plans" },
  { category: "Team & Access", feature: "Audit log",                   us: true,               them: false },
  { category: "Team & Access", feature: "Public API",                  us: "Pro plan",         them: false },
];

const categories = [...new Set(ROWS.map((r) => r.category))];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return (
    <div className="flex justify-center">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
      </span>
    </div>
  );
  if (value === false) return (
    <div className="flex justify-center">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-muted)]">
        <X className="h-4 w-4 text-[var(--color-muted-foreground)]" />
      </span>
    </div>
  );
  return <p className="text-sm text-center text-[var(--color-foreground)] font-medium">{value}</p>;
}

export default function ComparePage() {
  return (
    <div className="bg-[var(--color-background)]">
      {/* Hero */}
      <section className="py-16 sm:py-20 text-center bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Badge variant="outline" className="mb-4 text-xs">Honest comparison · Updated September 2026</Badge>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] mb-4">
            GetProfitCalc vs. Other Profit Trackers
          </h1>
          <p className="text-lg text-[var(--color-muted-foreground)] mb-6">
            A fair, factual side-by-side of features, pricing, and platform support.
            No hype — just the numbers.
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] bg-[var(--color-muted)] inline-block px-4 py-2 rounded-full">
            &ldquo;Others&rdquo; represents typical pricing/features of leading profit trackers including TrueProfit, BeProfit, and similar tools.
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {categories.map((cat) => (
            <div key={cat} className="mb-8">
              <h2 className="text-sm font-bold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-3 px-2">
                {cat}
              </h2>
              <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium text-[var(--color-muted-foreground)] w-1/2">Feature</th>
                      <th className="px-5 py-3 text-center font-bold text-[var(--color-primary)]">GetProfitCalc</th>
                      <th className="px-5 py-3 text-center font-medium text-[var(--color-muted-foreground)]">Others</th>
                    </tr>
                  </thead>
                  <tbody className="bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
                    {ROWS.filter((r) => r.category === cat).map((row) => (
                      <tr key={row.feature} className="hover:bg-[var(--color-muted)]/30">
                        <td className="px-5 py-3">
                          <p className="text-[var(--color-foreground)]">{row.feature}</p>
                          {row.note && <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{row.note}</p>}
                        </td>
                        <td className="px-5 py-3"><Cell value={row.us} /></td>
                        <td className="px-5 py-3"><Cell value={row.them} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="text-xs text-center text-[var(--color-muted-foreground)] mt-2">
            Competitor data sourced from public pricing pages and feature lists as of September 2026.
            Features and pricing may have changed — verify with each provider.
          </p>
        </div>
      </section>

      {/* Why switch section */}
      <section className="py-12 bg-[var(--color-muted)] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] text-center mb-8">
            Why sellers switch to GetProfitCalc
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { title: "Price shock",         body: "TrueProfit starts at $39. BeProfit at $25. GetProfitCalc starts at $3. For 90% of small sellers, you'll pay 90% less." },
              { title: "WooCommerce support", body: "Most profit trackers are Shopify-only. If you run WooCommerce or Etsy, you're left out. GetProfitCalc connects to all three." },
              { title: "AI insights",         body: "No competitor at this price point offers AI analysis. We use GPT-4 to proactively explain profit changes in plain English." },
              { title: "No credit card trial",body: "Most tools require Shopify billing or a credit card to start a trial. We don't — just your email." },
            ].map(({ title, body }) => (
              <div key={title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
                <h3 className="font-semibold text-[var(--color-foreground)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[var(--color-primary)]">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Try GetProfitCalc free for 14 days</h2>
          <p className="text-green-100 mb-6">No credit card. No Shopify billing required. Just your email.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" variant="secondary" className="font-semibold gap-2">
              <Link href="/auth/register">
                <Zap className="h-5 w-5" /> Start Free Trial
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="font-semibold border-white/40 text-white hover:bg-white/10">
              <Link href="/pricing">
                See Pricing <ArrowRight className="h-5 w-5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
