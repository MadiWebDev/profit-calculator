import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SeoPage } from "@/lib/seo-pages";
import { SEO_PAGES } from "@/lib/seo-pages";

function JsonLd({ page, path }: { page: SeoPage; path: string }) {
  const base = "https://getprofitcalc.com";
  const graph: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: `${base}${path}`,
      inLanguage: "en",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: base },
        { "@type": "ListItem", position: 2, name: page.h1, item: `${base}${path}` },
      ],
    },
  ];
  if (page.faqs.length > 0) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

export default function SeoLandingPage({ page, path }: { page: SeoPage; path: string }) {
  const related = page.related
    .map((slug) => SEO_PAGES[slug])
    .filter((p): p is SeoPage => Boolean(p));
  return (
    <div className="bg-[var(--color-background)]">
      <JsonLd page={page} path={path} />
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 text-sm text-[var(--color-muted-foreground)]">
        <Link href="/" className="hover:underline">Home</Link>
        <ChevronRight className="inline h-4 w-4 mx-1" aria-hidden />
        <span className="text-[var(--color-foreground)]">{page.h1}</span>
      </nav>
      {/* Hero */}
      <section className="py-12 sm:py-16 text-center bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Badge variant="secondary" className="mb-4">{page.eyebrow}</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{page.h1}</h1>
          <p className="mt-5 text-lg text-[var(--color-muted-foreground)] leading-relaxed">{page.intro}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/auth/register">Start tracking free <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">
            Connects to Shopify in minutes. CSV import for historical orders. No spreadsheet wrangling.
          </p>
        </div>
      </section>
      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">What you get with GetProfitCalc</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {page.features.map((f) => (
            <div key={f.title} className="rounded-xl border p-5">
              <h3 className="font-semibold flex items-start gap-2">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden /> {f.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">How it works</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {page.steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] font-bold">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)] leading-relaxed">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>
      {/* Comparison */}
      {page.compare && (
        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">{page.compare.title}</h2>
          <p className="mt-3 text-center text-sm text-[var(--color-muted-foreground)]">{page.compare.note}</p>
          <div className="mt-8 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-[var(--color-accent)]">
                  <th className="text-left p-4 font-semibold">Feature</th>
                  <th className="text-center p-4 font-semibold">GetProfitCalc</th>
                  <th className="text-center p-4 font-semibold">{page.compare.competitor}</th>
                </tr>
              </thead>
              <tbody>
                {page.compare.rows.map((r) => (
                  <tr key={r.feature} className="border-b last:border-0">
                    <td className="p-4 font-medium">{r.feature}</td>
                    <td className="p-4 text-center">{r.us}</td>
                    <td className="p-4 text-center text-[var(--color-muted-foreground)]">{r.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">Frequently asked questions</h2>
        <div className="mt-8 space-y-3">
          {page.faqs.map((f) => (
            <details key={f.q} className="rounded-xl border p-5">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-3 text-sm text-[var(--color-muted-foreground)] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      {/* Related */}
      {related.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12">
          <h2 className="text-xl font-bold">Related pages</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {related.map((r) => (
              <Button key={r.slug} asChild variant="outline" size="sm">
                <Link href={`/${r.slug}`}>{r.h1}</Link>
              </Button>
            ))}
          </div>
        </section>
      )}
      {/* Final CTA */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16">
        <div className="rounded-2xl bg-[var(--color-accent)] p-8 text-center">
          <h2 className="text-2xl font-bold">Know your true profit, not just your revenue</h2>
          <p className="mt-2 text-[var(--color-muted-foreground)]">Connect Shopify, and see order-level profit with every cost included.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/auth/register">Get started <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/features">Explore all features</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
