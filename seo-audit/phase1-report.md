# Phase 1 — Fix every GSC issue (2026-11-20)

Branch: `seo-overhaul`, base `ded9fd8` (main after PR #103).
Commits (5, all on the branch):

- `fe07171` — comparison canonical + 301 (1B + 1E)
- `e1d793d` — robots.txt allows /api/og (1D)
- `0472875` — noindex private routes + footer link removal (1C)
- `ced7883` — stop doubling the brand in titles (pulled forward from Phase 2)
- `bf35a9b` — hub metadata + honest sitemap lastmod (1F + 1G)

## What was fixed, with evidence (local production build)

Verified against a local `next start` build of the branch
(24 checks, all pass in substance — see notes):

**1B 404 (3) — 1 confirmed, fixed.** `/compare/getprofitcalc` now
returns a **308 permanent redirect** to `/compare/profitcalc-io`
(Next.js renders `permanent: true` as 308, which Google treats
exactly like a 301). The other 2× 404 are still UNKNOWN — not in the
sitemap, not linked from the homepage, not reproduced by the crawl.
Needs the GSC per-issue URL lists or Vercel logs.

**1E Alternate canonical (5) — 1 confirmed, fixed.** The audit of
every `buildMetadata` `path` against its real route found exactly
one mismatch: `/compare/profitcalc-io` canonicalized to the dead
`/compare/getprofitcalc`. Now self-canonical. All other 35
`buildMetadata` pages and the 3 `generateMetadata` pages
(calculators/[slug], locale home/[slug]) are self-canonical. The
other 4× alternate-canonical URLs are still UNKNOWN (candidates:
trailing-slash and www variants).

**1D Blocked by robots.txt (5) — fixed.** `robots.txt` now has
`Allow: /api/og` alongside `Disallow: /api/`. Google applies the
longest matching rule, so the OG images are fetchable while every
other `/api/*` route stays blocked. Verified in the local build's
robots.txt output.

**1C Page with redirect (3) — fixed as far as code can fix it.**
`/dashboard` and `/onboarding` removed from the footer (they were
linked on every page). Both still 302 to `/auth/login` for logged-out
visitors — that redirect is correct behaviour for private pages; the
fix is that Googlebot no longer has a link to follow. Noindex
(`robots: index:false, follow:false`, the same pattern `/welcome`
already used) added to: `/dashboard/*` (layout), `/admin/*`
(layout), `/auth/*` (new layout), `/onboarding` (new layout),
`/shared/[token]` (new layout), `/portal/[token]` (page). Verified
live locally: `/auth/login` and `/auth/register` render 200 with the
noindex meta visible; `/dashboard` and `/onboarding` 302 to login.
`/docs/api` deliberately KEPT in the footer and sitemap: it is public
developer documentation. The 3rd redirect is most likely the www →
non-www **307 Temporary** — that redirect is set in Vercel (domain
settings), not in code, so it is a user-side step: Vercel Dashboard →
Domains → getprofitcalc.com → set the www redirect to permanent
(308). The Vercel connector is not connected, so it cannot be done
from here.

**1F Crawled – not indexed (3) — partially fixed, exact 3 still
UNKNOWN.** The `/calculators` hub now has unique metadata (new
server layout — the hub is a client component and had inherited the
default title/description shared with 12 other pages). The `/blog`
hub title named the competitor ("ProfitCalc") — now GetProfitCalc —
and has a canonical. The blog POSTS still have no SSR metadata at
all (client-rendered); their fix is the SSR rebuild in Phase 3. The
exact 3 URLs need the GSC list to confirm.

**1G Discovered – not indexed (178) — sitemap trust fixed; content
work is Phase 2/3.** `lastmod` was `new Date()` at build time
(identical on all 186 URLs, changing every deploy). Now each group
carries its last real content change from git history (8 distinct
dates; e.g. home 2026-11-11, pricing 2026-11-13, SEO pages
2026-10-28). Verified: sitemap still lists 186 URLs, no stale
compare URL. Blog posts are DB-backed, so their group date is the
last change to the blog pages — per-post dates from the post records
are a Phase 3 item. No URLs were cut from the sitemap in Phase 1:
every listed URL is 200 + self-canonical + indexable-intent; the cut
decision (thin locale pages) belongs to Phase 2/3 after the title
and content work.

**1A Server error (5xx) (2) — NOT reproduced, still unidentified.**
100 consecutive Googlebot-UA requests (5 key public URLs × 20) all
returned 200. No render-blocking third-party call was found in the
public pages' SSR path: currency/geo detection runs client-side
after mount (`/api/geo/currency`), and `/api/fx/rates` is cached with
fallbacks (PR #85/#103). The two 5xx URLs need the Vercel function
logs (Vercel is not connected) or the GSC per-issue URL lists. They
were most likely transient (cold start / third-party timeout during
Google's fetch). The Vercel connector must be connected before Phase
1A can be closed.

**Double-brand titles (pulled forward from Phase 2).** The root
layout's title template `%s | GetProfitCalc` applied on top of
`buildMetadata` (which already appends the brand), so every page
rendered `… | GetProfitCalc | GetProfitCalc`. Template removed; the
default title is unchanged. Verified locally: homepage
"Free Profit Calculators + Real-Time Profit Tracking for Ecommerce |
GetProfitCalc", calculator "Shopify Profit Calculator |
GetProfitCalc", no page carries the double suffix. One caveat: locale
home titles still read "GetProfitCalc — … | GetProfitCalc" — the
brand appears in the locale title text itself plus the suffix. That
is the locale template's own wording, a Phase 2 title-rewrite item,
not the layout bug.

**`<meta name="keywords">` removed** (same commit — ignored by
Google, only exposes strategy).

## Gates

- `tsc --noEmit`: 0 errors (one fix needed during the phase: the
  object form of `title` requires a `template`, so the default title
  is now a plain string).
- Production build: exit 0.
- Non-DB vitest suite: **828 passed / 2 failed** — the 2 failures are
  the pre-existing oauth-state failures (also failing on pristine
  main). No regressions. Log `~/workspace/vitest-seo-p1.log`.
- ESLint: UNVERIFIED (TypeScript 7 blocker, as on main).
- Local verification crawl: 24 checks, all pass in substance (one
  check expected a literal 301 and got Next.js's 308 permanent
  redirect; one locale check hit a trailing-slash 308 — both correct
  behaviour).

## Still open after Phase 1 (needs the user)

1. **GSC per-issue URL lists** — the only file sent so far is the
   counts-only zip (checked: `~/workspace/user/files/` contains no
   other GSC file; no other chat has one). Without the lists, the
   exact 2× 5xx, 2× 404, 4× alternate-canonical and 3×
   crawled-not-indexed URLs cannot be named.
2. **Connect Vercel** (or export the function logs) — needed to
   close 1A and to set the www redirect to permanent (307 → 308).
3. **www 307 → 308** in the Vercel dashboard (Domains).
4. Phase 2 go-ahead (titles/descriptions rewrite, locale hreflang,
   internal linking, geo-currency SSR fix, AdSense/CSP decision).
