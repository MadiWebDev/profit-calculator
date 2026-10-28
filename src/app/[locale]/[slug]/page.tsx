import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocaleLandingPage from "@/components/seo/LocaleLandingPage";
import { LOCALES, CORE_LOCALE_SLUGS, getLocale, getLocalePage } from "@/lib/seo-locales";

const BASE = "https://getprofitcalc.com";

export function generateStaticParams() {
  return LOCALES.flatMap((l) => CORE_LOCALE_SLUGS.map((slug) => ({ locale: l.code, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const loc = getLocale(locale);
  const page = getLocalePage(locale, slug);
  if (!loc || !page) return {};
  const languages: Record<string, string> = { "x-default": `${BASE}/${slug}` };
  for (const l of LOCALES) languages[l.code] = `${BASE}/${l.code}/${slug}`;
  return {
    title: `${page.title} | GetProfitCalc`,
    description: page.description,
    metadataBase: new URL(BASE),
    alternates: { canonical: `${BASE}/${locale}/${slug}`, languages },
    openGraph: {
      title: `${page.title} | GetProfitCalc`,
      description: page.description,
      url: `${BASE}/${locale}/${slug}`,
      siteName: "GetProfitCalc",
      locale: loc.dict.ogLocale,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const loc = getLocale(locale);
  const page = getLocalePage(locale, slug);
  if (!loc || !page) notFound();
  return <LocaleLandingPage locale={loc} page={page} path={`/${locale}/${slug}`} />;
}
