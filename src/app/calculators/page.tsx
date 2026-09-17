import { calculators } from "@/config/calculators";
import { CalculatorCard } from "@/components/CalculatorCard";
import { AdSlot } from "@/components/AdSlot";
import { buildMetadata } from "@/lib/seo";
import type { CalculatorConfig } from "@/types/calculator";

export const metadata = buildMetadata({
  title: "Free Profit & ROI Calculators — All Tools",
  description:
    "Browse all free profit calculators: Shopify, Amazon FBA, dropshipping, Facebook Ads ROAS, Google Ads ROI, freelancer profit, and general margin calculator.",
  path: "/calculators",
});

const categories: { key: CalculatorConfig["category"]; label: string; desc: string }[] = [
  { key: "ecommerce",   label: "Ecommerce",   desc: "Shopify, Amazon FBA, and dropshipping profit calculators" },
  { key: "advertising", label: "Advertising", desc: "ROAS, ROI, and CPA calculators for paid media" },
  { key: "freelance",   label: "Freelance",   desc: "Take-home pay and effective rate calculators" },
  { key: "general",     label: "General",     desc: "Universal profit margin and markup calculators" },
  { key: "real-estate", label: "Real Estate",     desc: "Universal profit margin and markup calculators" },
];

export default function CalculatorsPage() {
  const byCategory = (cat: CalculatorConfig["category"]) =>
    calculators.filter((c) => c.category === cat);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] mb-4">
          All Profit Calculators
        </h1>
        <p className="text-lg text-[var(--color-muted-foreground)] max-w-2xl mx-auto">
          {calculators.length} free calculators for ecommerce sellers, advertisers, dropshippers, freelancers,
          and small business owners. Choose the one that fits your model.
        </p>
      </div>

      {/* Category sections */}
      {categories.map(({ key, label, desc }) => {
        const group = byCategory(key);
        if (!group.length) return null;
        return (
          <section key={key} className="mb-14" aria-labelledby={`cat-${key}`}>
            <div className="mb-5">
              <h2 id={`cat-${key}`} className="text-2xl font-bold text-[var(--color-foreground)]">
                {label}
              </h2>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-1">{desc}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.map((config) => (
                <CalculatorCard key={config.slug} config={config} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Ad slot — below all calculators */}
      <div className="flex justify-center mt-4 mb-8">
        <AdSlot position="leaderboard" />
      </div>

      {/* SEO copy block */}
      <section className="mt-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-6 sm:p-8 prose prose-sm max-w-none text-[var(--color-muted-foreground)]">
        <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
          Why Use a Profit Calculator?
        </h2>
        <p>
          Revenue is vanity — profit is sanity. Many ecommerce sellers, dropshippers, and online marketers
          focus on topline revenue figures without accounting for all the costs eating into their margins.
          Platform fees, payment processing, advertising, shipping, and returns can turn a seemingly
          profitable product into a loss-making one.
        </p>
        <p>
          CalcProfit&apos;s suite of free calculators is designed to give you full transparency into every
          cost. Whether you&apos;re evaluating a new Shopify product, auditing your Meta Ads performance,
          or calculating your Amazon FBA net margin, these tools give you the numbers you need to make
          confident business decisions.
        </p>
        <p>
          Each calculator is purpose-built for a specific business model, using formulas that professionals
          in that industry actually rely on. Results update in real time as you type, and every calculator
          includes a shareable URL so you can collaborate with business partners and teams without
          copy-pasting spreadsheets.
        </p>
      </section>
    </div>
  );
}
