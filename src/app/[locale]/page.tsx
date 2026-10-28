import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocaleLandingPage from "@/components/seo/LocaleLandingPage";
import { LOCALES, getLocale } from "@/lib/seo-locales";

const BASE = "https://getprofitcalc.com";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.code }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const loc = getLocale(locale);
  if (!loc) return {};
  const languages: Record<string, string> = { "x-default": BASE };
  for (const l of LOCALES) languages[l.code] = `${BASE}/${l.code}`;
  return {
    title: `${loc.dict.home.title} | GetProfitCalc`,
    description: loc.dict.home.description,
    metadataBase: new URL(BASE),
    alternates: { canonical: `${BASE}/${locale}`, languages },
    openGraph: {
      title: `${loc.dict.home.title} | GetProfitCalc`,
      description: loc.dict.home.description,
      url: `${BASE}/${locale}`,
      siteName: "GetProfitCalc",
      locale: loc.dict.ogLocale,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc = getLocale(locale);
  if (!loc) notFound();
  return <LocaleLandingPage locale={loc} page={loc.dict.home} path={`/${locale}`} isHome />;
}
