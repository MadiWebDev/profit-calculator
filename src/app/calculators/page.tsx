"use client";

import type { Metadata } from "next";
import { calculators } from "@/config/calculators";
import { AdSlot } from "@/components/AdSlot";
import type { CalculatorConfig } from "@/types/calculator";
import { CalculatorsDirectory } from "@/components/CalculatorsDirectory";


const categories: {
  key: CalculatorConfig["category"];
  label: string;
  desc: string;
}[] = [
  {
    key: "ecommerce",
    label: "Ecommerce",
    desc: "Calculate product and store profitability across Shopify, Amazon FBA, dropshipping, marketplaces, and online stores.",
  },
  {
    key: "advertising",
    label: "Advertising",
    desc: "Measure advertising performance with ROAS, ROI, CPA, CAC, conversion, and paid media profitability calculators.",
  },
  {
    key: "freelance",
    label: "Freelance",
    desc: "Calculate freelance take-home income, hourly rates, project profitability, taxes, expenses, and effective earnings.",
  },
  {
    key: "general",
    label: "General",
    desc: "Calculate profit, profit margins, markup, revenue, costs, break-even points, and essential business metrics.",
  },
  {
    key: "real-estate",
    label: "Real Estate",
    desc: "Analyze real estate deals with rental yield, cash flow, ROI, property profit, mortgage costs, and investment calculators.",
  },
  {
    key: "saas",
    label: "SaaS",
    desc: "Measure SaaS performance with MRR, ARR, churn, LTV, CAC, gross margin, break-even, and subscription profitability calculators.",
  },
  {
    key: "crypto",
    label: "Crypto",
    desc: "Calculate cryptocurrency profits, losses, returns, trading fees, break-even prices, position sizes, and performance.",
  },
  {
    key: "finance",
    label: "Finance",
    desc: "Calculate interest, payments, returns, cash flow, break-even points, and essential personal and business finance metrics.",
  },
  {
    key: "restaurant",
    label: "Restaurant",
    desc: "Analyze restaurant profitability with food cost, menu pricing, gross margin, labor cost, delivery fees, and break-even calculators.",
  },
  {
    key: "retail",
    label: "Retail",
    desc: "Calculate retail pricing, markup, product margins, inventory profitability, discounts, operating costs, and break-even points.",
  },
  {
    key: "investing",
    label: "Investing",
    desc: "Evaluate investments with ROI, compound growth, dividends, portfolio returns, capital gains, and investment profit calculators.",
  },
];

export default function CalculatorsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)]">
      {/* Intro / Hero */}
      <section className="border-b border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-5 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-muted-foreground)] shadow-sm">
              Free calculators • Instant results • No signup required
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--color-foreground)] sm:text-5xl lg:text-6xl">
              Profit & Business Calculators
            </h1>

            <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-[var(--color-muted-foreground)] sm:text-lg">
              Calculate profit, margins, ROI, ROAS, costs, pricing, and other
              important business metrics with purpose-built calculators for
              ecommerce, advertising, freelancing, SaaS, investing, and more.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5">
                <strong className="text-[var(--color-foreground)]">
                  {calculators.length}
                </strong>{" "}
                <span className="text-[var(--color-muted-foreground)]">
                  calculators
                </span>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5">
                <strong className="text-[var(--color-foreground)]">
                  {categories.length}
                </strong>{" "}
                <span className="text-[var(--color-muted-foreground)]">
                  categories
                </span>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5">
                <span className="text-[var(--color-muted-foreground)]">
                  Built for real-world calculations
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive directory */}
      <CalculatorsDirectory
        calculators={calculators}
        categories={categories}
      />

      {/* Advertisement */}
      <div className="mx-auto flex max-w-7xl justify-center px-4 py-8 sm:px-6 lg:px-8">
        <AdSlot position="leaderboard" />
      </div>

      {/* SEO Content */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)] p-6 sm:p-8 lg:p-10">
          <div className="prose prose-sm max-w-none text-[var(--color-muted-foreground)]">
            <h2 className="mb-4 text-2xl font-bold text-[var(--color-foreground)]">
              Free Profit and Business Calculators
            </h2>

            <p>
              Understanding revenue is only one part of running a profitable
              business. Product costs, advertising expenses, payment processing
              fees, shipping, refunds, taxes, labor, platform commissions, and
              other operating expenses can significantly change the amount of
              money a business actually keeps.
            </p>

            <p>
              Our calculator collection is designed to make these calculations
              easier. Instead of building complicated spreadsheets for every
              scenario, you can select a calculator based on your business model
              and enter the relevant numbers to quickly estimate profitability
              and performance.
            </p>

            <h3 className="mt-8 text-lg font-bold text-[var(--color-foreground)]">
              Ecommerce Profitability
            </h3>

            <p>
              Ecommerce sellers can analyze product costs, selling prices,
              discounts, shipping, marketplace fees, advertising spend, refunds,
              and other expenses. These calculations can help you understand
              product-level profitability and the economics of an online store.
            </p>

            <h3 className="mt-8 text-lg font-bold text-[var(--color-foreground)]">
              Advertising Performance
            </h3>

            <p>
              Advertising calculators can help analyze metrics such as ROAS,
              ROI, CPA, CAC, conversion rates, and campaign profitability.
              Looking beyond revenue and measuring the costs associated with
              acquiring customers provides a more complete picture of campaign
              performance.
            </p>

            <h3 className="mt-8 text-lg font-bold text-[var(--color-foreground)]">
              Pricing, Margins, and Markup
            </h3>

            <p>
              Profit margin and markup calculations are useful when setting
              prices or evaluating products. While markup and margin are related,
              they are calculated differently and should not be treated as the
              same metric.
            </p>

            <h3 className="mt-8 text-lg font-bold text-[var(--color-foreground)]">
              Designed for Practical Business Decisions
            </h3>

            <p>
              Whether you are launching a new product, reviewing an advertising
              campaign, calculating freelance income, evaluating a property,
              analyzing a SaaS business, or reviewing an investment, the right
              calculator can turn raw numbers into easier-to-understand financial
              metrics.
            </p>

            <p>
              Results from these calculators are estimates based on the inputs
              provided. For accounting, tax, investment, lending, or other
              regulated financial decisions, use appropriate professional advice
              and verify calculations against your actual records and applicable
              rules.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}