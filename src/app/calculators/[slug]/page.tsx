import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getCalculator, getRelatedCalculators, calculators } from "@/config/calculators";
import { ProfitCalculator } from "@/components/ProfitCalculator";
import { CalculatorCard } from "@/components/CalculatorCard";
import { AdSlot } from "@/components/AdSlot";
import { Badge } from "@/components/ui/badge";
import { buildMetadata, buildCalculatorJsonLd } from "@/lib/seo";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return calculators.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const config = getCalculator(slug);
  if (!config) return {};
  return buildMetadata({
    title: config.title,
    description: config.metaDescription,
    path: `/calculators/${slug}`,
  });
}

function JsonLd({ data }: { data: object[] }) {
  return (
    <>
      {data.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}

export default async function CalculatorPage({ params }: Props) {
  const { slug } = await params;
  const config = getCalculator(slug);
  if (!config) notFound();

  const related = getRelatedCalculators(slug, 3);
  const jsonLd = buildCalculatorJsonLd({
    name: config.title,
    description: config.metaDescription,
    url: `/calculators/${slug}`,
    faqs: config.seoContent.faqs,
  });

  const { seoContent } = config;

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* ── BREADCRUMB ─────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <ol className="flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)]">
            <li><Link href="/" className="hover:text-[var(--color-foreground)]">Home</Link></li>
            <li><ChevronRight className="h-3.5 w-3.5" /></li>
            <li><Link href="/calculators" className="hover:text-[var(--color-foreground)]">Calculators</Link></li>
            <li><ChevronRight className="h-3.5 w-3.5" /></li>
            <li className="text-[var(--color-foreground)] font-medium truncate">{config.shortTitle}</li>
          </ol>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* ── PAGE HEADER ────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl" role="img" aria-label={config.shortTitle}>{config.icon}</span>
            <Badge variant="outline" className="capitalize">{config.category}</Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--color-foreground)] mb-3">
            {config.title}
          </h1>
          <p className="text-lg text-[var(--color-muted-foreground)] max-w-3xl">
            {config.description}
          </p>
        </div>

        {/* ── CALCULATOR TOOL ─────────────────────────────── */}
        <Suspense fallback={
          <div className="h-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] animate-pulse" />
        }>
          <ProfitCalculator slug={slug} />
        </Suspense>

        {/* ── AD SLOT (below calculator, never overlapping) ─ */}
        <div className="flex justify-center my-10">
          <AdSlot position="leaderboard" />
        </div>

        {/* ── LONG-FORM SEO CONTENT ─────────────────────── */}
        <article className="mt-2 max-w-4xl" aria-label="Educational content">

          {/* Intro */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">
              How to Use the {config.shortTitle}
            </h2>
            <p className="text-[var(--color-muted-foreground)] leading-relaxed text-base">
              {seoContent.intro}
            </p>
          </section>

          {/* Step-by-step */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-5">
              Step-by-Step Guide
            </h2>
            <ol className="space-y-3">
              {seoContent.howToSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-xs font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <p
                    className="text-sm text-[var(--color-muted-foreground)] leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: step.replace(/\*\*(.+?)\*\*/g, "<strong class=\"text-[var(--color-foreground)]\">$1</strong>"),
                    }}
                  />
                </li>
              ))}
            </ol>
          </section>

          {/* Formula */}
          {seoContent.formula && (
            <section className="mb-10">
              <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">Formula</h2>
              <div className="rounded-xl bg-[var(--color-muted)] border border-[var(--color-border)] p-5">
                <pre className="text-sm text-[var(--color-foreground)] whitespace-pre-wrap font-mono leading-relaxed">
                  {seoContent.formula}
                </pre>
              </div>
            </section>
          )}

          {/* Worked Example */}
          {seoContent.workedExample && (
            <section className="mb-10">
              <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">Worked Example</h2>
              <div className="rounded-xl bg-[var(--color-accent)] border border-[var(--color-border)] p-5">
                <pre className="text-sm text-[var(--color-foreground)] whitespace-pre-wrap leading-relaxed">
                  {seoContent.workedExample}
                </pre>
              </div>
            </section>
          )}

          {/* Mid-content ad slot */}
          <div className="flex justify-center my-10">
            <AdSlot position="rectangle" />
          </div>

          {/* FAQs */}
          <section className="mb-10" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl font-bold text-[var(--color-foreground)] mb-6">
              Frequently Asked Questions
            </h2>
            <div className="space-y-5">
              {seoContent.faqs.map(({ q, a }) => (
                <div
                  key={q}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
                >
                  <h3 className="font-semibold text-[var(--color-foreground)] mb-2">{q}</h3>
                  <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </section>

        </article>

        {/* ── RELATED CALCULATORS ─────────────────────────── */}
        {related.length > 0 && (
          <section className="mt-12 pt-10 border-t border-[var(--color-border)]" aria-labelledby="related-heading">
            <h2 id="related-heading" className="text-2xl font-bold text-[var(--color-foreground)] mb-6">
              Related Calculators
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {related.map((rel) => (
                <CalculatorCard key={rel.slug} config={rel} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
