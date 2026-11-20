# Phase 2 — Technical foundation (2026-11-20)

Branch: `seo-overhaul`, on top of Phase 1 (788db53).
Commits (9):

- `9305438` — 2A titles/descriptions (see also `4213b73` repair, below)
- `4213b73` — repair of the locale code lines the 2A script corrupted
- `dc49935` — 2B hreflang both ways + sitemap alternates
- `c335936` — 2C fixed USD on the server + client-only currency options
- `c80cf30` — 2D real 404s + per-post blog metadata
- `3ad682a` — 2E empty ad boxes removed + AdSense in CSP
- `fbedc10` — 2F comparison table (verified prices, dates, text alternatives)
- `39e49a0` — 2G internal links to ≥3 for thin pages
- `d15ccb9` — verification fixes: real 404 status (loading.tsx removal), default description 162→136, COGS title, 404-page noindex

## 2A — Titles ≤60 chars, descriptions ≤160, all unique

Before: 99 titles over 60 chars, 21 descriptions over 160, 19
duplicate locale descriptions, 3 duplicate title groups. After the
re-crawl of the fixed build: **0 titles over 60, 0 descriptions over
160**.

- Locale topic titles (95): the " — subtitle" tail dropped; the two
  still-long ad-spend titles shortened by hand. fr home title 61→52.
- Locale home descriptions (19): each home now has a distinct
  description about the site (free calculators + real-time tracking)
  instead of duplicating its shopify-profit-calculator description.
  The translations are short, simple sentences; a native-speaker
  review is still recommended (as the file header already notes).
- English SEO titles (17): topic name only. /shopify-profit-calculator
  retitled "Shopify Profit Calculator & Tracker" so it no longer
  duplicates the calculator tool's title.
- Calculator metaDescriptions (16) + /features, /compare, /help,
  /help/faq, /best-shopify-profit-tracker: trimmed to ≤160 by dropping
  the last output item, never by cutting mid-sentence.
- Homepage title 81→53 chars; /features and /compare/profitcalc-io
  titles shortened the same way.
- Cross-locale duplicates fixed: nl/da COGS titles and sv/da/nb P&L
  titles now differ per language.

**Verification caught two misses (fixed in `d15ccb9`):**

- `SITE_DESCRIPTION` — the root layout's default description — was
  **162 chars**, so every page inheriting it (/auth/login,
  /auth/register) was 2 chars over the limit. It was missed in the
  2A source scan because it lives in `src/lib/seo.ts`, not in a page
  file. Shortened to 136 by dropping the ad-platform list ("Facebook
  Ads, Google Ads, and"). The re-crawl confirms 0 descriptions over
  160.
- The `seo-pages` guard (page titles must be over 20 chars) failed
  on "Shopify COGS Tracker" — exactly 20 chars. Retitled "Shopify
  COGS Tracker & Costs" (28; renders 44 with the brand suffix).

Remaining duplicates after the re-crawl: only two groups, both
benign. The homepage appears twice (`/` and `//` — the same page
fetched under two URL forms, a crawl artifact). /auth/login and
/auth/register share the default title and description — both are
noindex pages, so they cannot compete in search; giving them
distinct titles is a cosmetic follow-up, not done here.

**Incident (fixed, lesson recorded):** the 2A script's
home-description pass split `seo-locales.ts` with `re.split()` on a
pattern with two capture groups and joined ALL parts back together.
`re.split` returns captured groups as extra elements, so each locale
code was duplicated after its closing quote (`code: "es"eses,`). The
file was committed in that state because 2A was not type-checked
before committing; tsc caught it after 2B. Repaired in `4213b73`
(19 lines); after the repair the diff vs the Phase 1 head contains
only the intended title/description changes, and tsc is 0.
**Rule from now on: run tsc after every commit, not just at phase
gates** — it ran clean after each Phase 2 commit that followed.

## 2B — Hreflang both ways + sitemap alternates

Phase 0 found hreflang only on the locale pages — the English pages
declared none. Now:

- New `buildLocaleLanguages(path)` in `src/lib/seo.ts`: one source
  of truth for the cluster (x-default + en + all 19 locale codes).
  `buildMetadata` takes an optional `languages` field.
- Homepage + the 5 core English SEO pages declare the cluster.
- The locale pages use the same helper (which also adds the missing
  explicit `en` entry their hand-built maps lacked).
- `sitemap.xml`: the homepage, the 5 core English entries and all
  114 locale entries carry `xhtml:link` alternates; the other URLs
  have no translations, so they carry none.

## 2C — Geo-currency SSR fix

Phase 0 found the geo-detected DZD rendered selected in the SSR
homepage HTML plus 296 `<option>` elements. The root cause was not
geo detection at all: `FALLBACK` was `CURRENCIES[0]`, and the
registry is ordered by region (Africa first), so the first entry is
DZD — the comment even said "USD". The server rendered DZD as the
selected currency and the context default was DZD. `FALLBACK` is now
the USD entry looked up by code, so Googlebot and every first paint
see USD; geo detection still runs client-side after mount for real
visitors, exactly as the documented precedence requires.

The 296 `<option>`s were the footer converter's two `<select>`s each
rendering all 148 registry currencies into the SSR HTML. The full
lists now render only after mount; the server HTML carries just the
selected option per select, and the first client render still matches
SSR (mounted starts false), so hydration stays clean. The navbar
CurrencySelector was already a click-to-open popover and needed no
change.

## 2D — Real 404s + per-post blog metadata

- New `src/app/not-found.tsx`: a real 404 page with links to the
  pages most visitors want (home, calculators, Shopify calculator,
  blog, pricing, help).
- `/blog/[slug]` is now a server shell: `generateMetadata` fetches
  the published post (new `src/lib/blog-seo.ts`, React `cache()` so
  the metadata and page checks share one DB query) and returns its
  real title, a ≤160-char description trimmed at a word boundary, its
  canonical and its featured image; a slug with no published post
  calls `notFound()`, which renders not-found.tsx. The article body
  still loads client-side — its move to SSR is Phase 3.
- The old client page moved unchanged into `BlogPostPageClient.tsx`
  (slug as a prop instead of useParams); its error state no longer
  claims "404" — a fetch failure is a load error now that the 404
  case lives on the server.

**The 404 status did NOT work at first — found and fixed during
verification (`d15ccb9`).** The first build rendered the custom 404
page for a bad slug but returned **HTTP 200** (the soft 404 Phase 0
found, unchanged). Root cause, proven by experiment in dev mode:
the `loading.tsx` Suspense boundaries — `src/app/loading.tsx` (root)
and `src/app/blog/loading.tsx` — stream the page shell with a 200
status before `notFound()` resolves, so the status can never become
404. Removing the blog file alone still gave 200; removing both gave
a real 404. Both files are deleted in this phase. **Trade-off,
stated plainly:** routes without their own `loading.tsx` (homepage,
features, compare, legal pages, about, contact, docs) lose the
instant skeleton on navigation — the previous page stays visible
until the new one is ready. Routes with their own loading file
(dashboard, admin, auth, calculators, onboarding, pricing, help,
locale) keep theirs. This reverses part of the November 12
loading-feedback build; if the skeleton matters more than the 404
status, say so and the two files come back — but the blog soft 404
comes back with them.

**Residual, pre-existing, NOT fixed:** a mistyped URL that matches
no route at all (e.g. `/this-page-does-not-exist`) still returns
HTTP 200 while rendering the 404 page — even with no `loading.tsx`
anywhere. That is a separate streaming behaviour of this app, not
caused by 2D, and it predates the SEO work (the live site does the
same). Mitigation in this phase: `not-found.tsx` now exports
`robots: { index: false, follow: true }`, so those soft-404 URLs can
never be indexed, while their links to real pages are still
followed.

Caveats: post titles come from the database, so a very long editorial
title can still render over 60 chars. The 8 posts' titles are not
readable locally (they live in the production DB); check the rendered
titles after deploy. The 8 posts correctly return 404 in the local
build because the local database holds no blogs at all — in
production they return 200 with their real metadata.

## 2E — Empty ad boxes removed + AdSense in CSP

- `AdSlot` now renders nothing when no `adSlotId` is given. No slot
  ID exists anywhere in the codebase or env, so no placement can
  serve an ad today; the four call sites stay as placement markers,
  and passing a real slot ID from the AdSense dashboard enables a
  placement. The permanent dashed "Ad" box is gone from the homepage,
  the calculators hub and every calculator page.
- CSP `script-src` now includes `https://pagead2.googlesyndication.com`
  (dev and prod), so the AdSense script the root layout loads is no
  longer blocked on every page. When the first real slot goes live,
  `frame-src` and `img-src` will also need
  `googleads.g.doubleclick.net` / `tpc.googlesyndication.com` (ad
  iframes and creatives) — noted in the code comment, not added now
  since no slot exists.

## 2F — Comparison table

Re-verified against the vendors' own pricing pages and independent
checks from November 2026 (trueprofit.io/pricing; BeProfit's Shopify
listing, checked 3–6 Nov 2026).

- Starting price for Others was "$39/month" (homepage) and
  "$39–$49/month" (compare page). TrueProfit starts at $35/mo (Basic,
  300 orders) and BeProfit at $49/mo (Basic, 450 orders; free up to
  150 orders). Both now read "$35–$49/month".
- "Unlimited-order plan price" for Others was "$99–$249/month". Only
  BeProfit has an unlimited plan (Plus, $249/mo); TrueProfit's top
  plan is $200/mo for 3,500 orders, not unlimited. Now "$249/month"
  with a note saying exactly that.
- The September 2026 dates are now November 2026 on both pages,
  because the data was re-verified this month — not merely restamped.
- Icon-only check/cross cells now carry sr-only "Included" /
  "Not included" text (icons aria-hidden) on both tables.

Not changed (flagged for Phase 3): the homepage intro line "the
features other profit trackers charge $349/month for" is rhetorical
— no vendor publishes $349; TrueProfit tops out at $200/mo plus
overage and BeProfit Plus at $249/mo. And the homepage table has a
redundant "CSV import" row beside "CSV import (any platform)".

## 2G — Internal links to ≥3 for thin pages

- New `src/lib/blog-posts.ts`: the 8 published posts as one shared
  list (slug + real title). The sitemap now uses it instead of its
  own hardcoded array, so a post can never be in the sitemap but
  unlinked from every page.
- Homepage gains a "Latest from the Blog" section and the calculators
  hub a "Guides & Tutorials" section, each linking all 8 posts with
  their real titles (server-rendered, so the crawl sees them — the
  /blog hub's links are client-rendered and invisible to a plain
  crawl).
- /data-deletion joins the footer's Company links beside Privacy
  Policy and Terms (sitewide).
- One relevant related link each: sellerboard-alternative from
  trueprofit-alternative, profitario-alternative from
  beprofit-alternative, printify-profit-tracker from
  dropshipping-profit-tracker.

## Gates

- `tsc --noEmit`: 0 errors (run after every Phase 2 commit).
- Production build: exit 0 — twice (`~/workspace/build-seo-p2.log`
  for the 2A–2G tree, `~/workspace/build-seo-p2b.log` for the final
  tree including `d15ccb9`).
- Non-DB vitest suite: **828 passed / 2 failed (830)** — the only
  failures are the 2 pre-existing oauth-state tests
  (`~/workspace/vitest-seo-p2b.log`). The first run caught the
  seo-pages title-length failure (see 2A); it passes after the fix.
- ESLint: UNVERIFIED (TypeScript 7 blocker, as on main).
- Local verification crawl of the final build (189 URLs,
  `~/workspace/seo-p2-crawl.csv`, `~/workspace/seo-p2-crawl2.log`):
  181× 200; the 8× 404 are the blog posts, which correctly 404
  locally because the local database holds no blogs. 0 titles over
  60 chars; 0 descriptions over 160; canonical paths all match their
  URLs; hreflang present on English pages (21 links: x-default + en
  + 19 locales) and locale pages; sitemap still 186 URLs with 2520
  `xhtml:link` alternates and 8 distinct lastmod dates; homepage SSR
  has 2 `<option>`s (was 296) with USD selected and no DZD; no "Ad"
  box in the homepage HTML; CSP header includes googlesyndication;
  inlink counts ≥3 for every 2G target (blog posts 4 each,
  /data-deletion 182, the three alternatives 3 each);
  /compare/getprofitcalc returns 308; /dashboard 302s to login;
  /auth/login and /auth/register carry noindex.
- Targeted status checks on the final build: `/blog/no-such-post`
  → **404** (was 200 before `d15ccb9`); unknown route → 200
  (residual, see 2D).

## Still open after Phase 2 (needs the user)

1. **GSC per-issue URL lists** — still only the counts-only zip.
   The exact 2× 5xx, 2× 404, 4× alternate-canonical and 3×
   crawled-not-indexed URLs remain unidentified (same as Phase 1).
2. **Connect Vercel** (or export the function logs) — needed to
   close 1A and to set the www redirect to permanent (307 → 308).
3. **www 307 → 308** in the Vercel dashboard (Domains).
4. Phase 3 go-ahead (blog SSR rebuild, on-page content, internal
   linking depth, "How it works" / worked examples / related
   calculators on calculator pages, locale content depth).
