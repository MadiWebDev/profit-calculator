import type { MetadataRoute } from "next";
import { calculators } from "@/config/calculators";
import { BASE_URL, buildLocaleLanguages } from "@/lib/seo";
import { SEO_PAGES } from "@/lib/seo-pages";
import { LOCALES, CORE_LOCALE_SLUGS } from "@/lib/seo-locales";
import { BLOG_POST_LINKS } from "@/lib/blog-posts";

/**
 * Honest lastmod — the last content change per group, from git history
 * (last commit touching the page or its data file). The old code stamped
 * every URL with `new Date()` at build time, so all 186 URLs shared one
 * timestamp that changed on every deploy and carried no signal.
 * When a page's content changes, update its date here (or the group
 * date it shares). Blog posts are DB-backed; their group date is the
 * last change to the blog pages — per-post dates from the post records
 * are a Phase 3 improvement.
 */
const LASTMOD = {
  home: new Date("2026-11-11"),
  pricing: new Date("2026-11-13"),
  features: new Date("2026-11-03"),
  compare: new Date("2026-11-11"),
  calculatorsHub: new Date("2026-10-17"),
  calculator: new Date("2026-11-12"),
  blog: new Date("2026-10-17"),
  about: new Date("2026-10-25"),
  help: new Date("2026-11-11"),
  contact: new Date("2026-11-11"),
  docs: new Date("2026-11-01"),
  legal: new Date("2026-11-11"),
  seo: new Date("2026-10-28"),
  locale: new Date("2026-10-28"),
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // The homepage and the 5 core topics exist in all 19 locales, so
  // their sitemap entries carry the same hreflang cluster the pages
  // declare (Phase 2B). No other URL has translations.
  const homeLanguages = buildLocaleLanguages("");
  const coreLanguages = Object.fromEntries(
    CORE_LOCALE_SLUGS.map((slug) => [slug, buildLocaleLanguages(`/${slug}`)]),
  );

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL,                                    lastModified: LASTMOD.home,       changeFrequency: "weekly",  priority: 1.0, alternates: { languages: homeLanguages } },
    { url: `${BASE_URL}/pricing`,                       lastModified: LASTMOD.pricing,    changeFrequency: "weekly",  priority: 0.95 },
    { url: `${BASE_URL}/features`,                      lastModified: LASTMOD.features,   changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/compare/profitcalc-io`,         lastModified: LASTMOD.compare,    changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/calculators`,                   lastModified: LASTMOD.calculatorsHub, changeFrequency: "weekly",  priority: 0.85 },
    { url: `${BASE_URL}/blog`,                          lastModified: LASTMOD.blog,       changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE_URL}/about`,                         lastModified: LASTMOD.about,      changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/help`,                          lastModified: LASTMOD.help,       changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/help/getting-started`,          lastModified: LASTMOD.help,       changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/help/faq`,                      lastModified: LASTMOD.help,       changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/help/glossary`,                 lastModified: LASTMOD.help,       changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/help/contact`,                  lastModified: LASTMOD.help,       changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/contact`,                       lastModified: LASTMOD.contact,    changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/docs/api`,                      lastModified: LASTMOD.docs,       changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/privacy-policy`,                lastModified: LASTMOD.legal,      changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE_URL}/terms-of-service`,              lastModified: LASTMOD.legal,      changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE_URL}/refund-policy`,                 lastModified: LASTMOD.legal,      changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE_URL}/data-deletion`,                 lastModified: LASTMOD.legal,      changeFrequency: "yearly",  priority: 0.2 },
  ];

  const calculatorPages: MetadataRoute.Sitemap = calculators.map((c) => ({
    url: `${BASE_URL}/calculators/${c.slug}`,
    lastModified: LASTMOD.calculator,
    changeFrequency: "monthly",
    priority: 0.85,
  }));

  // Blog posts: the shared list (also linked from the homepage and
  // the calculators hub), so a post can never be in the sitemap but
  // unlinked from every page.
  const blogPages: MetadataRoute.Sitemap = BLOG_POST_LINKS.map(({ slug }) => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: LASTMOD.blog,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // SEO landing pages: 21 English pages mirroring the competitor sitemap.
  // The 5 core topics exist in all 19 locales, so their entries carry
  // the hreflang cluster; the other 16 have no translations.
  const seoPages: MetadataRoute.Sitemap = Object.keys(SEO_PAGES).map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    lastModified: LASTMOD.seo,
    changeFrequency: "monthly",
    priority: 0.85,
    ...(coreLanguages[slug] ? { alternates: { languages: coreLanguages[slug] } } : {}),
  }));

  // Localised landing pages: 19 locales x (home + 5 core topics) = 114 URLs.
  const localePages: MetadataRoute.Sitemap = LOCALES.flatMap((locale) => [
    { url: `${BASE_URL}/${locale.code}`, lastModified: LASTMOD.locale, changeFrequency: "monthly" as const, priority: 0.7, alternates: { languages: homeLanguages } },
    ...CORE_LOCALE_SLUGS.map((slug) => ({
      url: `${BASE_URL}/${locale.code}/${slug}`,
      lastModified: LASTMOD.locale,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      alternates: { languages: coreLanguages[slug] },
    })),
  ]);

  return [...staticPages, ...calculatorPages, ...blogPages, ...seoPages, ...localePages];
}
