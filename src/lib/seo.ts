import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profitcalc.io";

export function buildMetadata({
  title,
  description,
  path = "",
  image,
  noIndex = false,
}: {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
}): Metadata {
  const url = `${BASE_URL}${path}`;
  const ogImage = image ?? `${BASE_URL}/api/og?title=${encodeURIComponent(title)}`;

  return {
    title: `${title} | CalcProfit`,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: `${title} | CalcProfit`,
      description,
      url,
      siteName: "CalcProfit",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | CalcProfit`,
      description,
      images: [ogImage],
      site: "@profitcalc",
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

export const SITE_NAME = "CalcProfit";
export const SITE_DESCRIPTION =
  "Free profit and ROI calculators for ecommerce sellers, dropshippers, Amazon FBA, Facebook Ads, Google Ads, and freelancers. Calculate your real profit in seconds.";
export { BASE_URL };
