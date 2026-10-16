import Link from "next/link";
import { CheckCircle, Calculator, Users, Target } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { calculators } from "@/config/calculators";

export const metadata = buildMetadata({
  title: "About GetProfitCalc",
  description:
    "GetProfitCalc is a free hub of profit and ROI calculators built for ecommerce sellers, dropshippers, Amazon FBA sellers, marketers, and freelancers.",
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
          About GetProfitCalc
        </h1>
        <p className="text-xl text-[var(--color-muted-foreground)] max-w-2xl mx-auto leading-relaxed">
          Free profit calculators and a real-time profit-tracking dashboard — everything an ecommerce
          seller needs to know their true margin.
        </p>
      </div>

      {/* Mission */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">Our Mission</h2>
        <div className="space-y-4 text-[var(--color-muted-foreground)] leading-relaxed">
          <p>
            GetProfitCalc exists because most profit calculators are too simple. They ask for revenue and
            COGS, subtract them, and call it margin. But any experienced ecommerce seller knows that the
            real answer is buried under Shopify transaction fees, Stripe processing charges, shipping costs,
            Facebook ad spend, Amazon FBA fees, and return rates.
          </p>
          <p>
            We built GetProfitCalc to give every seller, marketer, and freelancer a free tool that reflects
            the true complexity of running an online business — without requiring a finance degree or a
            spreadsheet full of custom formulas.
          </p>
          <p>
            Every calculator on this site is free, requires no account, and works in real time. Our goal
            is simple: help you know your actual profit before you make decisions, not after.
          </p>
        </div>
      </section>

      {/* Two products */}
      <section className="mb-14 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Free calculators */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 mb-4">
            <Calculator className="h-5 w-5 text-[var(--color-primary)]" />
          </div>
          <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-2">Free Calculators</h3>
          <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed mb-4">
            {calculators.length}+ browser-based profit and ROI calculators covering ecommerce, ads,
            investing, real estate, and more. No account required — instant results as you type.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/calculators">Browse Calculators →</Link>
          </Button>
        </div>

        {/* SaaS platform */}
        <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-card)] p-6 relative overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider bg-[var(--color-primary)] text-white px-2 py-0.5 rounded-full">
            Paid
          </div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 mb-4">
            <Target className="h-5 w-5 text-[var(--color-primary)]" />
          </div>
          <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-2">Profit-Tracking Dashboard</h3>
          <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed mb-4">
            A subscription SaaS dashboard that connects to your Shopify, WooCommerce, or Etsy store and
            automatically tracks order-level profit, COGS, ad spend, and AI-powered insights — in real time.
            Plans start at <strong className="text-[var(--color-foreground)]">$3 / month</strong> with a
            7-day free trial, no credit card required.
          </p>
          <Button asChild size="sm">
            <Link href="/pricing">See Plans & Pricing →</Link>
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-14 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { icon: Calculator, value: `${calculators.length}+`, label: "Free Calculators" },
          { icon: Users,      value: "$3/mo",                  label: "Starting Price" },
          { icon: Target,     value: "Real-Time",              label: "Live Profit Tracking" },
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
            "Real-time order-level profit tracking (SaaS)",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
              <span className="text-sm text-[var(--color-foreground)]">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Who we are */}
      <section className="mb-14 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-3">Who We Are</h2>
        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          GetProfitCalc is built and operated by{" "}
          <strong className="text-[var(--color-foreground)]">Muhammad Hammad - </strong>, an independent
          developer based in Pakistan. Payments are processed securely by{" "}
          <a
            href="https://www.paddle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-primary)] hover:underline"
          >
            Paddle.com
          </a>
          , our Merchant of Record.
        </p>
      </section>

      {/* Disclaimer */}
      <section className="mb-14 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-6">
        <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-3">Important Disclaimer</h2>
        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          GetProfitCalc provides calculators and educational content for informational purposes only. The
          results produced by our tools are estimates based on the values you input and the formulas we
          apply. They do not constitute financial, tax, legal, or business advice. Platform fees, tax
          rates, shipping costs, and other variables change frequently — always verify figures with
          official sources. For tax advice, consult a qualified accountant or tax professional.
        </p>
      </section>

      {/* CTA */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-3">Ready to get started?</h2>
        <p className="text-[var(--color-muted-foreground)] mb-6">
          Use the free calculators instantly, or try the profit-tracking dashboard free for 7 days.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/calculators">Browse Free Calculators</Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/pricing">Start Free Trial</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
