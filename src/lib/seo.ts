import type { Metadata } from "next";
import { LOCALES } from "./seo-locales";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://getprofitcalc.com";

/**
 * The hreflang cluster for a page that exists in English and in all 19
 * locales (the homepage and the 5 core topics). x-default and `en` are
 * the English URL; every other code is the locale URL. One source of
 * truth — the locale pages and the sitemap use this too, so the cluster
 * can never drift one-way again (Phase 0 found hreflang only on the
 * locale pages, never on the English ones).
 */
export function buildLocaleLanguages(path: string): Record<string, string> {
  const languages: Record<string, string> = {
    "x-default": `${BASE_URL}${path}`,
    en: `${BASE_URL}${path}`,
  };
  for (const l of LOCALES) languages[l.code] = `${BASE_URL}/${l.code}${path}`;
  return languages;
}

export function buildMetadata({
  title,
  description,
  path = "",
  image,
  noIndex = false,
  languages,
}: {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  languages?: Record<string, string>;
}): Metadata {
  const url = `${BASE_URL}${path}`;
  const ogImage = image ?? `${BASE_URL}/api/og?title=${encodeURIComponent(title)}`;

  return {
    title: `${title} | GetProfitCalc`,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: { canonical: url, ...(languages ? { languages } : {}) },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: `${title} | GetProfitCalc`,
      description,
      url,
      siteName: "GetProfitCalc",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | GetProfitCalc`,
      description,
      images: [ogImage],
      site: "@getprofitcalc",
    },
  };
}

export function buildCalculatorJsonLd({
  name,
  description,
  url,
  faqs,
}: {
  name: string;
  description: string;
  url: string;
  faqs: { q: string; a: string }[];
}) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name,
      description,
      url: `${BASE_URL}${url}`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "All",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];
}

export const SITE_NAME = "GetProfitCalc";
export const SITE_DESCRIPTION =
  "Free profit and ROI calculators for ecommerce sellers, dropshippers, Amazon FBA, and freelancers. Calculate your real profit in seconds.";
export { BASE_URL };
