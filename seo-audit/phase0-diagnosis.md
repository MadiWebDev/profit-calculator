# Phase 0 — Diagnosis (no code changed)

Branch: `seo-overhaul`, based on live main `ded9fd8` (PR #103 merged
20 Nov). This phase changes no application code — only the `seo-audit/`
evidence folder. Date: 2026-11-20.

## Baseline captured

- `seo-audit/baseline/` — `curl -sI` headers for the 12-URL matrix
  (http/https, www/non-www, calculators, trailing-slash variant,
  robots.txt, sitemap.xml, `/api/og?title=test`, `/dashboard`,
  `/auth/login`, `/onboarding`), the full live `robots.txt` and
  `sitemap.xml`, and the homepage HTML as Googlebot sees it.
- `seo-audit/crawl.csv` — 191 URLs (all 186 sitemap URLs + the 5
  extra internal URLs linked from the homepage), fetched with a
  Googlebot user-agent: status, final URL, canonical, meta robots,
  title, description, H1 count, word count, in-sitemap flag, inlink
  count. Crawler: `seo-audit/crawl.py`.
- `seo-audit/gsc-url-map.md` — bucket-by-bucket URL map (see the
  caveat there: **no per-URL GSC lists were attached**, only counts).

## Site facts (verified, not assumed)

- App Router (Next.js 16), `trailingSlash` unset (= no trailing
  slash), `metadataBase = https://getprofitcalc.com`.
- Live sitemap: **186 URLs** — 18 static + 25 calculators + 8 blog
  posts + 21 English SEO pages + 114 locale pages (19 locales × 6).
- Indexed ≈ 42, not-indexed 199 → ≈144 sitemap URLs unindexed +
  ≈55 known URLs outside the sitemap.
- `robots.txt`: `Allow: /`, `Disallow: /api/`, sitemap + host listed.
- HSTS on; CSP on; `X-Content-Type-Options: nosniff` on.
- `http → https`: 308. `www → non-www`: **307 Temporary**.
  Trailing slash: 308 to the no-slash URL.
- `/dashboard` and `/onboarding` (logged out): **302** to
  `/auth/login?callbackUrl=…` (NextAuth default).
- `/api/og?title=test`: **200 image/png** — but robots-blocked.
- Bogus URL: real 404. `/blog/<nonexistent>`: **200** (soft 404).
- No custom `not-found.tsx`.

## Root cause per GSC bucket

### 1. Discovered – currently not indexed (178) — the sitemap batch

**Root cause: a 186-URL sitemap whose bulk is thin, template, or
SSR-empty pages, discovered by Google as one batch on 14 Nov.**
No code change landed 13–14 Nov; the sitemap had contained the batch
since PR #19 (28 Oct). Google processed the "All known pages"
sitemap then. The backlog is a quality + crawl-priority problem, not
a discovery problem:

- 114 locale pages: ~300 real words each, titles 61–114 chars,
  hreflang declared on locale pages only (English pages declare
  none), locale home + one topic page share the same description
  in several languages.
- 21 English SEO pages: titles 68–97 chars, template copy.
- 8 blog posts: **zero article content in the SSR HTML** (client
  component fetches `/api/blogs/:slug` after hydration), default
  title + default description on all 8, **no canonical, no H1**.
- `/blog` hub: 0 H1, 0 post links in SSR HTML, no canonical.
- `/calculators` hub: default title + default description.
- Blog posts have **1 internal inlink each**; several alternative
  pages have 2. Bar is ≥3.
- Sitemap `lastmod` is **identical for all 186 URLs**
  (2026-11-19T14:39:25Z — `new Date()` at build time), so it
  carries no signal and every deploy "updates" every URL.

### 2. Crawled – currently not indexed (3)

**Root cause (probable): pages Google fetched and judged not worth
indexing.** Strongest candidates are the blog posts (see above) and
the `/calculators` hub — all fetched, all with default metadata and
no SSR content. **The exact 3 are UNKNOWN** without the GSC URL
list. Phase 1 will confirm from the list, then either rebuild the
pages as server-rendered with unique content or noindex them.

### 3. Blocked by robots.txt (5)

**Root cause: `Disallow: /api/` blocks the OG images.**
Every page's `og:image` is `/api/og?title=<page title>` — a distinct
URL per page — and Googlebot discovers them from the meta tags, then
is blocked from fetching them. Verified live: the image returns 200,
robots.txt disallows the path. No other `/api/*` route is linked
publicly, so the OG images are the only `/api/` URLs Google can
discover. Phase 1: allow `/api/og` specifically, keep the rest of
`/api/` disallowed.

### 4. Alternate page with proper canonical tag (5)

**Root cause (1 confirmed): a stale canonical.**
`/compare/profitcalc-io` canonicalizes to
`https://getprofitcalc.com/compare/getprofitcalc`, which **returns
404**. `src/app/compare/profitcalc-io/page.tsx:11` passes the stale
`path: "/compare/getprofitcalc"` to `buildMetadata` — the page was
renamed and the canonical was never updated. The other 4 are
UNKNOWN (candidates: trailing-slash and `www` variants). Phase 1:
fix the stale path, audit every `buildMetadata` `path` against the
real route, and make the sitemap contain only canonical URLs.

### 5. Not found (404) (3)

**Root cause (1 confirmed): the stale canonical target above**
(`/compare/getprofitcalc` → 404). The other 2 are UNKNOWN — not in
the sitemap, not linked from the homepage (the crawl found zero 404s
among 191 URLs). Candidates: old calculator/blog slugs, old
`/dashboard/*` paths. Needs the GSC URL list or Vercel logs.

### 6. Page with redirect (3)

**Root cause: private app pages linked sitewide + a temporary
www redirect.** `/dashboard` and `/onboarding` are linked from the
footer/nav on **every page** and 302 to `/auth/login` for logged-out
visitors (including Googlebot). The 3rd is most likely the `www` →
non-www **307 Temporary** redirect (should be 301/308). Phase 1:
remove footer/body links to `/dashboard` and `/onboarding`, noindex
the app routes, and make the www redirect permanent.

### 7. Server error (5xx) (2)

**Root cause: UNKNOWN.** The full crawl on 20 Nov returned **zero
5xx** (191 × 200). The two URLs are not in the sitemap and not
linked from the homepage. Prime suspects are pages whose SSR depends
on a live third-party call (currency API, DB, `/api/blogs`) that
timed out during Google's fetch. Phase 1, step 1A: read the Vercel
function logs for the affected dates to name the two URLs, then make
public pages independent of live third-party calls at render time.

## Sitewide defects found (affect many buckets)

1. **Double brand in titles — sitewide.** The root layout defines a
   title template `%s | GetProfitCalc`, and `buildMetadata` already
   appends `| GetProfitCalc`. Every page using `buildMetadata` gets
   `… | GetProfitCalc | GetProfitCalc`. Result: **~120 of 191 titles
   exceed 60 chars** (worst: locale ad-spend pages at 107–114).
   Homepage: 81 chars. This single bug explains most of the
   over-long titles.
2. **13 pages share the default title and description**
   (`/calculators` hub, all 8 blog posts, `/auth/login`,
   `/auth/register`, `/dashboard`, `/onboarding`).
3. **Descriptions over 160 chars on 36 pages** (features: 213;
   most calculators 161–179; `/compare`: 172).
4. **`<meta name="keywords">` present** (root layout).
5. **Auth/app pages are indexable and linked sitewide** — no
   `noIndex` on `/auth/*`, `/dashboard`, `/onboarding`; footer links
   to `/dashboard`, `/onboarding`, `/docs/api`; `/auth/register`
   linked 7× from the homepage.
6. **Blog is entirely client-rendered.** Posts fetch from
   `/api/blogs/:slug` after hydration. Googlebot sees skeletons:
   no title, no description, no canonical, no H1, no article text.
   The `/blog` hub is the same. `/blog/<nonexistent>` returns 200.
   The `/blog` hub title also contains the competitor name
   ("ProfitCalc" instead of "GetProfitCalc").
7. **Server-side geo-detection renders into the HTML.** The
   homepage SSR HTML has `DZD` (Algerian Dinar) as the **selected**
   currency and a `DZ` flag chip — the egress IP geolocates to
   Algeria. Googlebot in different regions sees different default
   currencies. Plus **296 `<option>` elements** (148 currencies × 2
   selects) and 7 "Loading…" strings in the SSR HTML.
8. **Comparison table cells are icon-only SVGs** with no text
   alternative ("Others" column, "Last updated September 2026").
9. **Ad slot is permanently empty.** The homepage `<AdSlot>` gets
   no `adSlotId` (renders a dashed box labelled "Ad"), and the live
   CSP `script-src` does not include
   `pagead2.googlesyndication.com`, so the AdSense script loaded in
   `layout.tsx` is blocked in every browser.
10. **Hreflang is one-way.** Locale pages declare x-default + all
    19 locales; English pages declare none (homepage HTML: 0
    hreflang links). Sitemap carries no hreflang either.
11. **`/compare/profitcalc-io` title says "vs TrueProfit" while the
    description names TrueProfit, BeProfit and others** — verify the
    comparison content is accurate before keeping it (Phase 3).

## What Phase 0 could NOT establish

- The exact URLs for: 2× 5xx, 2× 404 (of 3), 4× alternate-canonical
  (of 5), 3× crawled-not-indexed, and the 5× blocked (hypothesis
  only). **Needed: the GSC per-issue URL exports** (Search Console
  → Pages → open each issue → Export) — the uploaded zip contains
  counts only — and/or the Vercel function logs.
- Whether the 5xx URLs still error (none error now).
- Lighthouse / Core Web Vitals scores (Phase 5 tooling).

## Decisions needed (do not silently decide — Phase 1+)

1. **AI crawlers** (GPTBot, ClaudeBot, PerplexityBot,
   Google-Extended): allow (default, citations drive discovery) or
   block? Safest default: **allow**.
2. **The 19 locale pages**: keep all 114, or cut to the locales
   with real traffic and noindex the rest until they have unique
   content? They are real translations, but thin template pages.
3. **`/docs/api`**: meant to rank (it's in the sitemap) or
   developer-only (noindex)?
4. **Blog**: rebuild as server-rendered (the real fix) — confirm
   the posts live in the DB/API and can be rendered at build time.
5. **AdSense**: fix the CSP + pass real slot IDs, or remove the
   empty AdSlot placeholder until ads are ready?
6. **"Others" comparison**: keep the unnamed comparison, or name
   verifiable competitors only (needs accurate, dated data)?

## Post-merge re-verification (PR #103, main `ded9fd8`)

Per the standing rule, the user merge of PR #103 (footer converter)
is re-verified on the merged head, which is also this branch's base.
`tsc --noEmit`: **0 errors** on this tree. Production build:
**exit 0** (log `~/workspace/build-seo-p0.log`). ESLint: UNVERIFIED
(TypeScript 7 blocker, as on main). Live `/api/fx/rates` no-auth
check was already proven 200 on the PR branch; the live-site check
after deploy is still open.

## Phase 1 preview (starts only on your go-ahead)

Phase 1 fixes, in order: 1A identify the 2× 5xx via Vercel logs (needs
the Vercel connection or the GSC URL lists) → 1B 301 the known 404
(`/compare/getprofitcalc` → `/compare/profitcalc-io`) → 1C remove
private footer links, noindex app routes, fix the www 307 → 1D allow
`/api/og` in robots.txt → 1E fix the stale canonical + audit all
`buildMetadata` paths → 1F/1G cut the sitemap to quality URLs, fix
`lastmod`, and start the blog SSR rebuild. Each step gets its own
commit; gates (tsc, build, tests) run after every phase.
