import { describe, it, expect } from "vitest";
import { SEO_PAGES } from "@/lib/seo-pages";
import { LOCALES, CORE_LOCALE_SLUGS, getLocalePage } from "@/lib/seo-locales";

const EXPECTED_ENGLISH = [
  "use-cases",
  "compare",
  "trueprofit-alternative",
  "beprofit-alternative",
  "sellerboard-alternative",
  "profitario-alternative",
  "dropshipping-profit-tracker",
  "printful-profit-tracker",
  "printify-profit-tracker",
  "best-shopify-profit-tracker",
  "shopify-profit-calculator",
  "shopify-profit-analytics",
  "shopify-cogs-tracker",
  "shopify-profit-and-loss-report",
  "shopify-ad-spend-profit-tracker",
  "shopify-net-profit-tracker",
  "shopify-profit-tracker-vs-spreadsheet",
  "multi-store-profit-tracking",
  "multi-currency-profit-tracking",
  "vat-shopify-profit-tracking",
  "cod-profit-tracking-shopify",
];

describe("SEO landing pages (English)", () => {
  it("covers all 21 sitemap slugs", () => {
    expect(Object.keys(SEO_PAGES).sort()).toEqual([...EXPECTED_ENGLISH].sort());
  });

  it("every page is complete, unique, and honest", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const page of Object.values(SEO_PAGES)) {
      expect(page.slug).toBeTruthy();
      expect(page.title.length).toBeGreaterThan(20);
      expect(page.description.length).toBeGreaterThan(80);
      expect(page.h1.length).toBeGreaterThan(10);
      expect(page.intro.length).toBeGreaterThan(80);
      expect(page.features.length).toBeGreaterThanOrEqual(6);
      expect(page.steps.length).toBe(3);
      expect(page.faqs.length).toBeGreaterThanOrEqual(4);
      for (const f of [...page.features, ...page.steps]) {
        expect(f.title).toBeTruthy();
        expect(f.desc.length).toBeGreaterThan(20);
      }
      for (const f of page.faqs) {
        expect(f.q.endsWith("?")).toBe(true);
        expect(f.a.length).toBeGreaterThan(30);
      }
      // No invented prices. POD pages must explicitly deny a native
      // integration (the phrase appears only inside that denial).
      const blob = JSON.stringify(page);
      expect(blob).not.toMatch(/\$\d+\/month/);
      if (page.slug === "printful-profit-tracker") {
        expect(blob).toContain("There is no native Printful API sync");
      }
      if (page.slug === "printify-profit-tracker") {
        expect(blob).toContain("There is no native Printify API sync");
      }
      // Related slugs must resolve to real pages.
      for (const slug of page.related) expect(SEO_PAGES[slug]).toBeDefined();
      expect(titles.has(page.title)).toBe(false);
      expect(descriptions.has(page.description)).toBe(false);
      titles.add(page.title);
      descriptions.add(page.description);
    }
  });
});

describe("SEO locale pages", () => {
  it("covers 19 locales and the 5 core topics plus home", () => {
    expect(LOCALES).toHaveLength(19);
    expect(CORE_LOCALE_SLUGS).toHaveLength(5);
    for (const locale of LOCALES) {
      expect(locale.code).toMatch(/^[a-z]{2}$/);
      expect(locale.dict.features.length).toBeGreaterThanOrEqual(4);
      expect(locale.dict.steps.length).toBe(3);
      expect(locale.dict.faqs.length).toBeGreaterThanOrEqual(3);
      for (const slug of CORE_LOCALE_SLUGS) {
        const p = getLocalePage(locale.code, slug);
        expect(p).toBeDefined();
        expect(p!.title.length).toBeGreaterThan(10);
        expect(p!.description.length).toBeGreaterThan(40);
        expect(p!.intro.length).toBeGreaterThan(40);
      }
    }
  });
});
