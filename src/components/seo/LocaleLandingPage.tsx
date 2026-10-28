import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Locale, LocalePageCopy } from "@/lib/seo-locales";
import { CORE_LOCALE_SLUGS } from "@/lib/seo-locales";

export default function LocaleLandingPage({
  locale,
  page,
  path,
  isHome,
}: {
  locale: Locale;
  page: LocalePageCopy;
  path: string;
  isHome?: boolean;
}) {
  const d = locale.dict;
  const base = "https://getprofitcalc.com";
  const related = isHome
    ? CORE_LOCALE_SLUGS.map((slug) => ({ slug, copy: d.pages[slug] }))
    : CORE_LOCALE_SLUGS.filter((slug) => `/${locale.code}/${slug}` !== path).map((slug) => ({
        slug,
        copy: d.pages[slug],
      }));
  const graph = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: `${base}${path}`,
      inLanguage: locale.code,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: d.breadcrumbHome, item: `${base}/${locale.code}` },
        { "@type": "ListItem", position: 2, name: page.h1, item: `${base}${path}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: d.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  return (
    <div className="bg-[var(--color-background)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
      />
      <nav aria-label="Breadcrumb" className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 text-sm text-[var(--color-muted-foreground)]">
        <Link href={`/${locale.code}`} className="hover:underline">{d.breadcrumbHome}</Link>
        {!isHome && (
          <>
            <ChevronRight className="inline h-4 w-4 mx-1" aria-hidden />
            <span className="text-[var(--color-foreground)]">{page.h1}</span>
          </>
        )}
      </nav>
      <section className="py-12 sm:py-16 text-center bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Badge variant="secondary" className="mb-4">{d.eyebrow}</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{page.h1}</h1>
          <p className="mt-5 text-lg text-[var(--color-muted-foreground)] leading-relaxed">{page.intro}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/auth/register">{d.ctaPrimary} <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">{d.ctaSecondary}</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">{d.featuresHeading}</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {d.features.map((f) => (
            <div key={f.title} className="rounded-xl border p-5">
              <h3 className="font-semibold flex items-start gap-2">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden /> {f.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">{d.stepsHeading}</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {d.steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] font-bold">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)] leading-relaxed">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">{d.faqHeading}</h2>
        <div className="mt-8 space-y-3">
          {d.faqs.map((f) => (
            <details key={f.q} className="rounded-xl border p-5">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-3 text-sm text-[var(--color-muted-foreground)] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12">
        <h2 className="text-xl font-bold">{d.relatedHeading}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {related.map((r) => (
            <Button key={r.slug} asChild variant="outline" size="sm">
              <Link href={`/${locale.code}/${r.slug}`}>{r.copy.h1}</Link>
            </Button>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16">
        <div className="rounded-2xl bg-[var(--color-accent)] p-8 text-center">
          <h2 className="text-2xl font-bold">{d.ctaTitle}</h2>
          <p className="mt-2 text-[var(--color-muted-foreground)]">{d.ctaText}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/auth/register">{d.ctaPrimary} <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/features">{d.ctaSecondary}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
