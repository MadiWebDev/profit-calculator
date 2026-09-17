import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import {
  ArrowLeft,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Lightbulb,
  List,
  Sparkles,
} from "lucide-react";

import {
  getCalculator,
  getRelatedCalculators,
  calculators,
} from "@/config/calculators";

import { ProfitCalculator } from "@/components/ProfitCalculator";
import { CalculatorCard } from "@/components/CalculatorCard";
import { AdSlot } from "@/components/AdSlot";
import { Badge } from "@/components/ui/badge";
import { BackToTop } from "@/components/BackToTop";

import {
  buildMetadata,
  buildCalculatorJsonLd,
} from "@/lib/seo";

import { ReadingProgress } from "@/components/ReadingProgress";
import { CalculatorPageActions } from "@/components/CalculatorPageActions";

interface Props {
  params: Promise<{ slug: string }>;
}

/* -------------------------------------------------------
 * STATIC PARAMS
 * ----------------------------------------------------- */

export async function generateStaticParams() {
  return calculators.map((calculator) => ({
    slug: calculator.slug,
  }));
}

/* -------------------------------------------------------
 * METADATA
 * ----------------------------------------------------- */

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params;

  const config = getCalculator(slug);

  if (!config) {
    return {};
  }

  return buildMetadata({
    title: config.title,
    description: config.metaDescription,
    path: `/calculators/${slug}`,
  });
}

/* -------------------------------------------------------
 * JSON-LD
 * ----------------------------------------------------- */

function JsonLd({
  data,
}: {
  data: object[];
}) {
  return (
    <>
      {data.map((item, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item),
          }}
        />
      ))}
    </>
  );
}

/* -------------------------------------------------------
 * PAGE
 * ----------------------------------------------------- */

export default async function CalculatorPage({
  params,
}: Props) {
  const { slug } = await params;

  const config = getCalculator(slug);

  if (!config) {
    notFound();
  }

  const related = getRelatedCalculators(slug, 3);

  const { seoContent } = config;

  const jsonLd = buildCalculatorJsonLd({
    name: config.title,
    description: config.metaDescription,
    url: `/calculators/${slug}`,
    faqs: seoContent.faqs,
  });

  const categoryLabel = config.category
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <div className="min-h-screen bg-[var(--color-background)]">

      {/* -------------------------------------------------
       * JSON-LD
       * ------------------------------------------------- */}

      <JsonLd data={jsonLd} />

      {/* -------------------------------------------------
       * READING PROGRESS
       * ------------------------------------------------- */}

      <ReadingProgress />

      {/* -------------------------------------------------
       * BREADCRUMB
       * ------------------------------------------------- */}

      <nav
        aria-label="Breadcrumb"
        className="border-b border-[var(--color-border)] bg-[var(--color-muted)]"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden py-3 text-sm">

            <li className="shrink-0">
              <Link
                href="/"
                className="text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                Home
              </Link>
            </li>

            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            </li>

            <li className="shrink-0">
              <Link
                href="/calculators"
                className="text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                Calculators
              </Link>
            </li>

            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            </li>

            <li className="min-w-0">
              <span className="block truncate font-medium text-[var(--color-foreground)]">
                {config.shortTitle}
              </span>
            </li>

          </ol>
        </div>
      </nav>

      {/* -------------------------------------------------
       * MAIN
       * ------------------------------------------------- */}

      <main>

        {/* -------------------------------------------------
         * HERO
         * ------------------------------------------------- */}

        <section className="border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">

            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">

              <div className="max-w-4xl">

                {/* Category */}
                <div className="mb-4 flex flex-wrap items-center gap-2">

                  <Badge
                    variant="outline"
                    className="capitalize"
                  >
                    {categoryLabel}
                  </Badge>

                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Free calculator
                  </span>

                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    •
                  </span>

                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Instant results
                  </span>

                </div>

                {/* Icon */}
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] text-3xl shadow-sm">
                  <span
                    role="img"
                    aria-label={config.shortTitle}
                  >
                    {config.icon}
                  </span>
                </div>

                <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-foreground)] sm:text-4xl lg:text-5xl">
                  {config.title}
                </h1>

                <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--color-muted-foreground)] sm:text-lg">
                  {config.description}
                </p>

              </div>

              {/* Actions */}
              <CalculatorPageActions
                slug={slug}
                title={config.title}
              />

            </div>
          </div>
        </section>

        {/* -------------------------------------------------
         * QUICK NAVIGATION
         * ------------------------------------------------- */}

        <div className="border-b border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

            <div className="flex overflow-x-auto scrollbar-none">

              <a
                href="#calculator"
                className="flex shrink-0 items-center gap-2 border-b-2 border-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-primary)]"
              >
                <Calculator className="h-4 w-4" />
                Calculator
              </a>

              <a
                href="#how-to-use"
                className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                <BookOpen className="h-4 w-4" />
                How to use
              </a>

              {seoContent.formula && (
                <a
                  href="#formula"
                  className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
                >
                  <List className="h-4 w-4" />
                  Formula
                </a>
              )}

              {seoContent.workedExample && (
                <a
                  href="#example"
                  className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
                >
                  <Lightbulb className="h-4 w-4" />
                  Example
                </a>
              )}

              <a
                href="#faq"
                className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                <CircleHelp className="h-4 w-4" />
                FAQ
              </a>

            </div>
          </div>
        </div>

        {/* -------------------------------------------------
         * CALCULATOR SECTION
         * ------------------------------------------------- */}

        <section
          id="calculator"
          className="scroll-mt-32"
        >
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">

              <div>

                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                    <Sparkles className="h-4 w-4" />
                    Calculate now
                  </div>

                  <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
                    Use the {config.shortTitle}
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    Enter your numbers below to calculate your result.
                    You can adjust the inputs at any time to compare
                    different scenarios.
                  </p>
                </div>

                <Suspense
                  fallback={
                    <div className="min-h-[420px] animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)]" />
                  }
                >
                  <ProfitCalculator slug={slug} />
                </Suspense>

              </div>

              {/* Helpful sidebar */}
              <aside className="hidden xl:block">
                <div className="sticky top-28 space-y-4">

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm">

                    <div className="mb-4 flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-[var(--color-primary)]" />

                      <h2 className="font-bold text-[var(--color-foreground)]">
                        Quick tips
                      </h2>
                    </div>

                    <ul className="space-y-3 text-sm leading-5 text-[var(--color-muted-foreground)]">
                      <li>
                        • Use actual costs whenever possible.
                      </li>

                      <li>
                        • Include fees, shipping, discounts,
                        and other relevant expenses.
                      </li>

                      <li>
                        • Compare multiple scenarios before
                        making pricing decisions.
                      </li>

                      <li>
                        • Review the formula and example below
                        to understand the result.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)] p-5">

                    <div className="mb-2 flex items-center gap-2">
                      <CircleHelp className="h-4 w-4 text-[var(--color-primary)]" />

                      <span className="text-sm font-semibold text-[var(--color-foreground)]">
                        Need another calculation?
                      </span>
                    </div>

                    <Link
                      href="/calculators"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Browse all calculators
                      <ChevronRight className="h-4 w-4" />
                    </Link>

                  </div>

                </div>
              </aside>

            </div>

          </div>
        </section>

        {/* -------------------------------------------------
         * AD
         * ------------------------------------------------- */}

        <div className="mx-auto flex max-w-7xl justify-center px-4 py-6 sm:px-6 lg:px-8">
          <AdSlot position="leaderboard" />
        </div>

        {/* -------------------------------------------------
         * EDUCATIONAL CONTENT
         * ------------------------------------------------- */}

        <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">

          {/* Introduction */}
          <section
            id="how-to-use"
            className="scroll-mt-32 mb-12"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <BookOpen className="h-5 w-5" />
              </div>

              <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
                How to Use the {config.shortTitle}
              </h2>
            </div>

            <p className="text-base leading-8 text-[var(--color-muted-foreground)]">
              {seoContent.intro}
            </p>
          </section>

          {/* Steps */}
          <section className="mb-12">
            <h2 className="mb-6 text-2xl font-bold text-[var(--color-foreground)]">
              Step-by-Step Guide
            </h2>

            <ol className="space-y-4">
              {seoContent.howToSteps.map(
                (step, index) => (
                  <li
                    key={index}
                    className="flex gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-white">
                      {index + 1}
                    </span>

                    <p
                      className="pt-1 text-sm leading-6 text-[var(--color-muted-foreground)]"
                      dangerouslySetInnerHTML={{
                        __html: step.replace(
                          /\*\*(.+?)\*\*/g,
                          '<strong class="text-[var(--color-foreground)]">$1</strong>'
                        ),
                      }}
                    />
                  </li>
                )
              )}
            </ol>
          </section>

          {/* Formula */}
          {seoContent.formula && (
            <section
              id="formula"
              className="scroll-mt-32 mb-12"
            >
              <h2 className="mb-5 text-2xl font-bold text-[var(--color-foreground)]">
                {config.shortTitle} Formula
              </h2>

              <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)] p-5 sm:p-6">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-7 text-[var(--color-foreground)]">
                  {seoContent.formula}
                </pre>
              </div>
            </section>
          )}

          {/* Worked Example */}
          {seoContent.workedExample && (
            <section
              id="example"
              className="scroll-mt-32 mb-12"
            >
              <h2 className="mb-5 text-2xl font-bold text-[var(--color-foreground)]">
                Worked Example
              </h2>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm sm:p-6">
                <pre className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-muted-foreground)]">
                  {seoContent.workedExample}
                </pre>
              </div>
            </section>
          )}

          {/* Mid-content ad */}
          <div className="my-12 flex justify-center">
            <AdSlot position="rectangle" />
          </div>

          {/* Important information */}
          <section className="mb-12">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)] p-5 sm:p-6">
              <div className="flex gap-3">
                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />

                <div>
                  <h2 className="font-bold text-[var(--color-foreground)]">
                    Understanding your result
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    Calculator results depend entirely on the
                    information entered. For the most useful
                    estimate, use current and accurate figures
                    and include all costs that apply to your
                    specific situation.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section
            id="faq"
            className="scroll-mt-32 mb-12"
            aria-labelledby="faq-heading"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <CircleHelp className="h-5 w-5" />
              </div>

              <h2
                id="faq-heading"
                className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl"
              >
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-3">
              {seoContent.faqs.map(({ q, a }) => (
                <details
                  key={q}
                  className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-[var(--color-foreground)] [&::-webkit-details-marker]:hidden">
                    <span>{q}</span>

                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90" />
                  </summary>

                  <div className="border-t border-[var(--color-border)] px-5 pb-5 pt-4">
                    <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
                      {a}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </section>

        </article>

        {/* -------------------------------------------------
         * RELATED CALCULATORS
         * ------------------------------------------------- */}

        {related.length > 0 && (
          <section
            className="border-t border-[var(--color-border)]"
            aria-labelledby="related-heading"
          >
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">

              <div className="mb-6 flex items-end justify-between gap-4">

                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                    Continue exploring
                  </p>

                  <h2
                    id="related-heading"
                    className="text-2xl font-bold text-[var(--color-foreground)]"
                  >
                    Related Calculators
                  </h2>
                </div>

                <Link
                  href="/calculators"
                  className="hidden items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline sm:flex"
                >
                  View all
                  <ChevronRight className="h-4 w-4" />
                </Link>

              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((calculator) => (
                  <CalculatorCard
                    key={calculator.slug}
                    config={calculator}
                  />
                ))}
              </div>

              <Link
                href="/calculators"
                className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-sm font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)] sm:hidden"
              >
                View all calculators
                <ChevronRight className="h-4 w-4" />
              </Link>

            </div>
          </section>
        )}

      </main>

      {/* -------------------------------------------------
       * FLOATING MOBILE CTA
       * ------------------------------------------------- */}

      <Link
        href="#calculator"
        className="fixed bottom-4 left-4 right-4 z-40 flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-3.5 text-sm font-bold text-white shadow-xl transition hover:opacity-95 sm:hidden"
      >
        <Calculator className="h-4 w-4" />
        Use Calculator
      </Link>

      {/* -------------------------------------------------
       * BACK TO TOP
       * ------------------------------------------------- */}

      <BackToTop />

    </div>
  );
}