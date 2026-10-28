# SEO landing pages (branch seo/landing-pages)

Mirrors the ProfitCalc.io sitemap structure on getprofitcalc.com, with
original GetProfitCalc copy — nothing copied from the competitor's pages.

## English: 21 pages

- Hubs: `/use-cases`, `/compare` (the existing `/compare/profitcalc-io`
  page is untouched).
- Alternatives: `/trueprofit-alternative`, `/beprofit-alternative`,
  `/sellerboard-alternative`, `/profitario-alternative`.
- Trackers and features: `/best-shopify-profit-tracker`,
  `/shopify-profit-calculator`, `/shopify-profit-analytics`,
  `/shopify-cogs-tracker`, `/shopify-profit-and-loss-report`,
  `/shopify-ad-spend-profit-tracker`, `/shopify-net-profit-tracker`,
  `/shopify-profit-tracker-vs-spreadsheet`, `/dropshipping-profit-tracker`,
  `/printful-profit-tracker`, `/printify-profit-tracker`,
  `/multi-store-profit-tracking`, `/multi-currency-profit-tracking`,
  `/vat-shopify-profit-tracking`, `/cod-profit-tracking-shopify`.

Each page has unique title/description metadata, a hero, feature grid,
3-step how-it-works, FAQ, related pages, CTAs, and JSON-LD (WebPage,
BreadcrumbList, FAQPage). Content lives in `src/lib/seo-pages.ts` and
renders through `src/components/seo/SeoLandingPage.tsx`.

## Localised: 114 pages

19 locales (es, fr, de, pt, nl, it, ja, ko, zh, hi, id, pl, sv, da, fi,
nb, cs, th, tr) x (home + 5 core topics: shopify-profit-calculator,
shopify-profit-analytics, shopify-cogs-tracker,
shopify-profit-and-loss-report, shopify-ad-spend-profit-tracker), served
from `src/app/[locale]/...` with hreflang alternates and canonicals.
Copy lives in `src/lib/seo-locales.ts`.

## Honesty rules enforced by tests (`src/lib/__tests__/seo-pages.test.ts`)

- No prices are asserted anywhere (pricing is Paddle-dynamic; the
  pricing page is the source of truth).
- Competitor comparison columns are qualitative and tell the reader to
  verify current vendor plans; no competitor prices or features invented.
- Printful/Printify pages state explicitly that POD products are tracked
  as Shopify orders with base cost set as COGS — no native POD API sync
  is claimed, because none exists.
- VAT page states it is not a tax filing tool.
- Sitemap (`src/app/sitemap.ts`) lists all 21 English + 114 locale URLs.

## Follow-ups (not blockers)

- Locale copy is short, simple-sentence translation: get a native-speaker
  pass on brand voice before pointing paid campaigns at locale pages.
- The root `<html lang>` stays `en` for locale pages (Next.js app-router
  limitation with a shared root layout); hreflang + og:locale are set per
  page. A per-locale `<html lang>` would need a locale layout restructure.
- Only the 5 core topics are localised, matching the competitor sitemap's
  locale coverage (the other English pages have no locale equivalents
  there either).
