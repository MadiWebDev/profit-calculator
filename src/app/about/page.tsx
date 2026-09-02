import Link from "next/link";
import { CheckCircle, Calculator, Users, Target } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { calculators } from "@/config/calculators";

export const metadata = buildMetadata({
  title: "About CalcProfit",
  description:
    "CalcProfit is a free hub of profit and ROI calculators built for ecommerce sellers, dropshippers, Amazon FBA sellers, marketers, and freelancers.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Hero */}
      <div className="text-center mb-14">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white mb-5">
          <Calculator className="h-7 w-7" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] mb-4">
          About CalcProfit
        </h1>
        <p className="text-xl text-[var(--color-muted-foreground)] max-w-2xl mx-auto leading-relaxed">
          We built the calculators we always wished existed — ones that account for{" "}
          <em>every</em> real cost, not just product and selling price.
        </p>
      </div>

      {/* Mission */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">Our Mission</h2>
        <div className="space-y-4 text-[var(--color-muted-foreground)] leading-relaxed">
          <p>
            CalcProfit exists because most profit calculators are too simple. They ask for revenue and
            COGS, subtract them, and call it margin. But any experienced ecommerce seller knows that the
            real answer is buried under Shopify transaction fees, Stripe processing charges, shipping costs,
            Facebook ad spend, Amazon FBA fees, and return rates.
          </p>
          <p>
            We built CalcProfit to give every seller, marketer, and freelancer a free tool that reflects
            the true complexity of running an online business — without requiring a finance degree or a
            spreadsheet full of custom formulas.
          </p>
          <p>
            Every calculator on this site is free, requires no account, and works in real time. Our goal
            is simple: help you know your actual profit before you make decisions, not after.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-14 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { icon: Calculator, value: `${calculators.length}`, label: "Free Calculators" },
          { icon: Users,      value: "100%",                  label: "Free, No Sign-up" },
          { icon: Target,     value: "Real-Time",             label: "Live Results as You Type" },
        ].map(({ icon: Icon, value, label }) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-center"
          >
            <Icon className="h-7 w-7 text-[var(--color-primary)] mx-auto mb-3" />
            <p className="text-3xl font-extrabold text-[var(--color-foreground)] mb-1">{value}</p>
            <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
          </div>
        ))}
      </section>

      {/* What we cover */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-5">What We Cover</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            "Shopify and ecommerce profit margins",
            "Facebook & Meta Ads ROAS and profitability",
            "Google Ads ROI and CPA analysis",
            "Dropshipping profit per order and projections",
            "Amazon FBA net margin and fee breakdowns",
            "Freelancer and service business take-home pay",
            "General business profit margin and markup",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
              <span className="text-sm text-[var(--color-foreground)]">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mb-14 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-6">
        <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-3">Important Disclaimer</h2>
        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          CalcProfit provides calculators and educational content for informational purposes only. The
          results produced by our tools are estimates based on the values you input and the formulas we
          apply. They do not constitute financial, tax, legal, or business advice. Platform fees, tax
          rates, shipping costs, and other variables change frequently — always verify figures with
          official sources. For tax advice, consult a qualified accountant or tax professional.
        </p>
      </section>

      {/* CTA */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-3">Ready to calculate your profit?</h2>
        <p className="text-[var(--color-muted-foreground)] mb-6">All {calculators.length} calculators are free and ready to use.</p>
        <Button asChild size="lg">
          <Link href="/calculators">Browse All Calculators</Link>
        </Button>
      </div>
    </div>
  );
}
