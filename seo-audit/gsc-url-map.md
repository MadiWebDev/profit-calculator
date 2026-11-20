# GSC URL map — GetProfitCalc (export dated 2026-11-20)

## Important caveat

**No per-URL lists were attached.** The uploaded zip
(`getprofitcalc.com-Coverage-2026-11-20.zip`) contains only counts:
`Chart.csv` (daily indexed / not-indexed / impressions),
`Critical issues.csv` (7 buckets with page counts) and `Metadata.csv`
(sitemap: "All known pages"). There are no URL lists to classify.

So the mapping below is derived from the live site instead: the live
sitemap (186 URLs), a full crawl of all 186 sitemap URLs + every
internal URL linked from the homepage (191 URLs total,
`seo-audit/crawl.csv`), and targeted `curl` probes. Buckets whose URLs
cannot be identified from the site alone are marked **UNKNOWN — needs
the GSC URL export** (Search Console → Pages → open the issue →
Export) or the Vercel function logs.

## The 14 Nov jump — what the 164 new URLs are

| Date | Not indexed | Indexed |
|------|-------------|---------|
| 13 Nov | 35 | 39 |
| 14 Nov | **199** | 42 |

No code change landed on 13–14 Nov (last sitemap change was the Help
Center commit `c29be9d`, 11 Nov; the locale/SEO sitemap entries landed
28 Oct in PR #19). The jump is Google **processing the expanded
sitemap in one batch**:

- Live sitemap: **186 URLs** — 18 static + 25 calculators + 8 blog
  posts + 21 English SEO landing pages + **114 locale pages**
  (19 locales × home + 5 topics).
- Indexed ≈ 42 → ≈ **144 sitemap URLs unindexed**.
- 199 not-indexed − 144 = **≈55 known URLs outside the sitemap**
  (auth/app pages, redirect targets, 404s, `/api/*` URLs).

The 164 are therefore the programmatic batch: the 114 locale pages,
the 21 English SEO pages, and the calculator/blog remainder. They
were in the sitemap since 28 Oct; Google discovered them as one batch
on 14 Nov. This is a discovery/quality backlog, not a 14 Nov code
change.

## Bucket-by-bucket map

### Discovered – currently not indexed — 178

The sitemap batch above. Breakdown by group (from `crawl.csv`):

| Group | Sitemap URLs | Why they sit unindexed |
|-------|--------------|------------------------|
| Locale pages (19 × 6) | 114 | Template pages, ~300 real words each (median 1,600 words incl. ~1,300 chrome); titles 61–114 chars (double brand); hreflang one-way only (locale pages declare the cluster, English pages declare none) |
| English SEO landing pages | 21 | Titles 68–97 chars (double brand); thin template copy |
| Calculators | 25 | Titles 62–79 chars (double brand); descriptions 161–179 chars |
| Blog posts | 8 | **Zero SSR content** — client-fetched; default title + default description on all 8; no canonical; no H1 |
| Static / hub | 18 | Homepage title 81 chars; `/blog` hub 0 H1, 0 post links in SSR |

### Crawled – currently not indexed — 3

Not identifiable from the export. Strongest candidates (crawl
evidence): the blog posts — fetched by Google, but with no unique
title, no description, no canonical, no H1 and no article text in the
HTML, they are the classic "crawled but not worth indexing" pages.
The `/calculators` hub shares the same defect (default title and
description). Needs the GSC list to confirm which 3.

### Blocked by robots.txt — 5

Leading hypothesis: **`/api/og?title=…` image URLs**. Every page's
`og:image` points at `/api/og?title=<page title>` (a distinct URL per
page), and `robots.txt` has `Disallow: /api/` — Googlebot discovers
the images from the meta tags and is blocked from fetching them.
Verified: `/api/og?title=test` returns **200 image/png** live, but
robots.txt disallows `/api/`. The other `/api/*` routes are not linked
anywhere public, so the OG images are the only `/api/` URLs Google
can discover. Fix: allow `/api/og` (see Phase 1).

### Alternate page with proper canonical tag — 5

**1 confirmed:** `/compare/profitcalc-io` canonicalizes to
`https://getprofitcalc.com/compare/getprofitcalc` — a URL that
**returns 404**. Root cause: `src/app/compare/profitcalc-io/page.tsx:11`
passes the stale `path: "/compare/getprofitcalc"` to `buildMetadata`.
The other 4 are UNKNOWN — candidates: trailing-slash variants
(`308` to the no-slash URL, verified live), `www` variants (307 to
non-www), and locale pages whose canonicals may collide. Needs the
GSC list.

### Not found (404) — 3

**1 confirmed:** `/compare/getprofitcalc` → **404** (the stale
canonical target above). The other 2 are UNKNOWN — they are not in
the sitemap and not linked from the homepage (the crawl found zero
404s among 191 URLs). Candidates: old calculator/blog slugs, old
`/dashboard/*` paths, deleted pages. Needs the GSC list or Vercel
logs.

### Page with redirect — 3

**2 confirmed:** `/dashboard` → 302 `/auth/login?callbackUrl=%2Fdashboard`
and `/onboarding` → 302 `/auth/login?callbackUrl=%2Fonboarding`
(NextAuth default 302, `src/lib/auth.config.ts:57`). Both are linked
from the footer/nav on **every page**, so Googlebot follows them on
every crawl. The 3rd is most likely the `www` → non-www redirect
(**307 Temporary**, verified live) or the `http` → `https` 308.
Fix: remove the footer/body links to `/dashboard` and `/onboarding`,
noindex the app routes, and make the www redirect a 301/308.

### Server error (5xx) — 2

**UNKNOWN.** The full crawl of all 191 URLs returned **zero 5xx**
(all final statuses 200) on 20 Nov. The two 5xx URLs are not in the
sitemap and not linked from the homepage. Candidates: pages whose SSR
depends on a live third-party call (currency API, DB, `/api/blogs`)
that timed out or errored during Google's fetch, or Vercel cold-start
timeouts. Needs the Vercel function logs for the affected dates —
Phase 1, step 1A.

## What the crawl proved (191 URLs, Googlebot UA, 20 Nov)

- Statuses: **191 × 200** — no live 4xx/5xx among sitemap +
  homepage-linked URLs right now.
- Redirects among crawled URLs: **2** (`/dashboard`, `/onboarding`).
- Non-self-canonical: **2** — `/compare/profitcalc-io` (wrong target,
  404) and `/` (trailing-slash string difference only — not a defect).
- Titles > 60 chars: **~120 of 191** — the double-brand bug
  (`| GetProfitCalc | GetProfitCalc`) is sitewide.
- Duplicate title: **13×** the default layout title (the
  `/calculators` hub + all 8 blog posts + `/auth/login` +
  `/auth/register` + `/dashboard` + `/onboarding`) — these pages
  have no unique metadata.
- Duplicate description: **13×** the default description.
- Descriptions > 160 chars: **36** (features 213, most calculators
  161–179, `/compare` 172).
- H1 = 0 in SSR HTML: **12** — `/blog` hub + all 8 blog posts +
  `/auth/login` + `/dashboard` + `/onboarding`.
- Blog posts: **0 words of article content in SSR HTML** (1,307 words
  = nav/footer/skeleton chrome only); no canonical; no H1; default
  title/description on all 8.
- Blog posts have **1 internal inlink each** (only from `/blog`);
  `data-deletion` has 1; several alternative pages have 2. The
  brief's bar is ≥3 inlinks per indexable page.
- Sitemap `lastmod`: **all 186 URLs share one timestamp**
  (2026-11-19T14:39:25Z, the last deploy) — `new Date()` at build
  time in `src/app/sitemap.ts`. Lastmod is meaningless.
- Homepage (Googlebot UA): title **81 chars**; `<meta keywords>`
  present; **296 `<option>` elements** (148 currencies × 2 selects);
  `DZD` is the **selected** currency in the SSR HTML (server-side
  geo-detection renders the visitor's currency); "Loading…" × 7;
  comparison cells are icon-only SVGs with no text; the AdSlot above
  the calculators renders an empty dashed box labelled "Ad" (no
  `adSlotId` passed, and the live CSP
  `script-src 'self' 'unsafe-inline' https://cdn.paddle.com` blocks
  the AdSense script `pagead2.googlesyndication.com`).
- `/auth/login`, `/auth/register`, `/dashboard`, `/onboarding` have
  **no noindex** (no `noIndex` usage in those routes) and are linked
  sitewide from the footer/nav.
- No custom `not-found.tsx` (Next.js default 404 page). A bogus URL
  returns a real 404; **`/blog/<nonexistent>` returns 200** (soft
  404 — the client component shows an error state instead).
- Hreflang exists on locale pages (x-default + all 19 locales) but
  **not on the English pages** (homepage HTML: 0 hreflang links).
