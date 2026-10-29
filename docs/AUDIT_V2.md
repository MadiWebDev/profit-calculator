# AUDIT_V2 — GetProfitCalc (profit-calculator), Phase 0

**Base audited:** remote `main` at `667d1cf` (merge of PR #21, merged by the
user on 2026-10-29). This audit was produced on branch `audit/v2-phase-0`
from that exact commit. Nothing on `main` was touched.

**Method:** read README, `docs/AUDIT.md` (2026-10-25, pre-rebuild baseline —
superseded by this document), `docs/DECISIONS.md` (D1–D15),
`docs/FINAL_REPORT.md` (rebuild report), `package.json`, `next.config.ts`,
`vercel.json`, `Dockerfile`, `.env.example`, and the full `src/` tree;
enumerated routes, models, jobs, and env vars mechanically (commands below);
checked the live open PR/issue lists via the GitHub API. No live Shopify,
Paddle, Meta, or other provider credentials exist in this environment, so
every live-provider behaviour is marked UNVERIFIED rather than assumed.

**How to regenerate the mechanical lists:**

```bash
find src/app -name "page.tsx" | sort            # 98 pages
find src/app/api -name "route.ts" | sort        # 136 API routes
ls src/models/                                  # 39 models
npx tsx scripts/audit-routes.ts                # auth-policy scan
```

## 1. Architecture map

**Stack (verified from `package.json` + configs):** Next.js 16.3.3 App Router
(standalone output, Turbopack build), React 19.2.8, TypeScript 5, Tailwind v4,
Mongoose 9, NextAuth v5 beta (`next-auth@5.0.0-beta.32`), Paddle billing
(`@paddle/paddle-node-sdk` 1.7.0, `@paddle/paddle-js` 1.4.0), Resend 6,
OpenAI SDK 7, Sentry 11 (`@sentry/nextjs` + `sentry.{client,edge,server}.config.ts`),
Recharts 3, Radix UI, Vitest 5 + Playwright 1.64. Docker image: multi-stage
`node:20-alpine`, healthcheck on `/api/health`, runs `server.js` as `nextjs`.

**Layers:**

| Layer | Where | Notes |
|---|---|---|
| Pages (marketing + SEO) | `src/app/` root, `(marketing)`-style public pages, `[locale]/` | 135 SEO landing pages (21 EN + 19 locales × 5 core slugs) from the 2026-10-28 SEO build; blog + admin under `src/app/admin/` |
| Dashboard | `src/app/(dashboard)/dashboard/*` | 43 dashboard pages (profit, pnl, orders, products, product-intel, ad-spend, ad-platforms, ltv, bundles, simulator, goals, risk, couriers, notifications, scheduled-reports, security, settings, …) |
| API | `src/app/api/*` | 136 route handlers (see §4) |
| Auth | `src/lib/auth.ts`, `src/lib/auth.config.ts`, `src/middleware.ts` | NextAuth JWT sessions; 30-day absolute / 7-day idle policy (`session-policy.ts`, added in PR #21); TOTP 2FA + recovery codes + trusted devices + step-up |
| Tenancy | `teamId` on (almost) every model | Enforced via `requireAuth` + `permissions.ts` (`can()`); roles owner > admin > member > viewer (viewer = 0, read-only) |
| Money | `src/lib/profit-engine.ts` (646 lines) + `src/lib/profit-extended.ts` (303) | Pure functions. **Float arithmetic with a `round()` to 2dp — NOT integer minor units and NOT a decimal library.** This is the central Phase 1 question (brief §A). Contract per AUDIT.md: revenue is tax-exclusive and already net of discounts; discounts/shipping-revenue/taxes are memos, never double-counted; refunds/chargebacks reduce net revenue; FX is explicit and throws on unknown currencies |
| Profit data | `src/lib/parity-reports.ts`, `src/lib/analytics.ts`, `src/lib/rollups.ts` | Parity shared engine (totals = sum of rows); `DailyRollup` is a cache — live orders remain the source of truth |
| Shopify | `src/lib/sync/shopify.ts`, `src/lib/shopify-graphql.ts` | REST order sync (paginated, 429/Retry-After backoff, incremental via `lastSyncAt`, idempotent upserts on `(teamId, storeId, externalId)`); GraphQL for variant cost-per-item; webhook topics incl. fulfillments, products, app/uninstalled, all mandatory GDPR topics |
| Ads | `src/lib/sync/{meta,google,tiktok,pinterest,snapchat}-ads.ts`, `src/lib/meta-ads-hardening.ts`, `src/lib/meta-attribution.ts` | Sync libs + OAuth routes exist for all 5 platforms; Meta is the hardened one (token refresh, 3-day repull tail, account-timezone dates, UTM-only attribution). `src/lib/ads/mock.ts` + `AD_MOCK_MODE`/`USE_MOCK_ADS` are refused in production (`sync/meta-ads.ts:205`) |
| Billing | `src/lib/paddle.ts`, `src/lib/paddle-webhooks.ts`, `src/lib/billing.ts`, `src/lib/trial.ts` | Paddle only. HMAC via SDK `unmarshal` on raw body (401 bad signature, 500 handler failure so Paddle retries), atomic dedup claim, stale-event ordering guard, cancel-at-period-end, past-due dunning with 24h cooldown |
| Comms | `src/lib/email.ts` (Resend), `src/lib/whatsapp.ts` (Meta Cloud API), `src/lib/alert-channels.ts` | Order notifications with per-event dedup; scheduled-report emails with real CSV/PDF attachments |
| Jobs | `src/lib/jobs.ts` (`CRON_JOBS`, 11 jobs), `src/lib/cron-runner.ts` | Idempotency keys, overlap protection, persistent `CronRun` records (the dead-letter equivalent) |
| Security libs | `src/lib/sanitize-mongo.ts`, `src/lib/ssrf.ts`, `src/lib/csrf.ts`, `src/lib/rate-limit.ts`, `src/lib/encryption-v2.ts` (+ legacy `encryption.ts` CryptoJS), `src/lib/ai-guard.ts`, `src/lib/csv-injection.ts` | Versioned AES-256-GCM keyring (`ENCRYPTION_KEYS_JSON`) with legacy decrypt fallback; SSRF guard; mongo sanitizer |
| Observability | `src/lib/logger.ts` (secret-redacting), Sentry configs, `/api/health`, `/api/ready` | Structured logging; health/ready endpoints exist |

**Request flow (typical dashboard read):** middleware (NextAuth authorized
callback) → dashboard layout (role + 2FA-setup redirects) → server component
or client page → API route (`requireAuth` → team scoping → Zod → rate limit →
Mongoose query by `teamId`) → response. Webhooks bypass sessions and use
HMAC + dedup instead. Cron routes use `CRON_SECRET` bearer auth.

## 2. Data model map (39 models, `src/models/`)

| Group | Models |
|---|---|
| Identity & tenancy | `User` (incl. `lastSeenAt`, `deletionScheduledAt`), `Team` (incl. `twoFactorRequiredForAdmins`, `paddleCustomerId`), `WorkspaceSettings`, `SessionDevice` |
| Commerce core | `Store` (Shopify + `csv_manual`), `Order` (full cost breakdown fields + `source`/`utmCampaign`/`landingSite`), `Product`, `CogsRule`, `Bundle` |
| Money & fees | `GatewayFee`, `MonthlyExpense`, `OtherFeeRule`, `DailyRollup`, `ProfitGoal` |
| Ads | `AdAccount`, `AdSpendDaily` (campaign-level granularity), `ConversionEvent` |
| Risk & couriers | `Blocklist` (SHA-256 hashes only), `RiskSignalWeight`, `Courier` (encrypted API key), `Shipment` |
| Comms & automation | `Notification`, `NotificationLog`, `NotifyRule`, `AlertRule`, `ScheduledReport`, `Insight` |
| Platform | `Subscription`, `ApiKey` (SHA-256 hash + `recentUseCount`), `AuditLog` (TTL), `SecurityEvent`, `Comment`, `SavedView`, `ClientWorkspace` (agency portal, `portalTokenHash`), `Blog` |
| Infra | `CronRun`, `WebhookEvent` (dedup), `WebhookSubscription`, `IdempotencyKey`, `index.ts` (barrel) |

Hot-query indexes live in `scripts/ensure-indexes.ts` (must be run once per
deploy — it is a manual step, not part of the build). Phase 1 verifies every
hot query against that script.

## 3. Pages (98 `page.tsx` files)

- `/dashboard`
- `/(dashboard)/dashboard/ad-platforms`
- `/(dashboard)/dashboard/ad-spend`
- `/(dashboard)/dashboard/alerts`
- `/(dashboard)/dashboard/bundles`
- `/(dashboard)/dashboard/cogs-hub`
- `/(dashboard)/dashboard/conversion`
- `/(dashboard)/dashboard/copilot`
- `/(dashboard)/dashboard/countries`
- `/(dashboard)/dashboard/couriers`
- `/(dashboard)/dashboard/currency`
- `/(dashboard)/dashboard/custom-dashboard`
- `/(dashboard)/dashboard/customers`
- `/(dashboard)/dashboard/gateways`
- `/(dashboard)/dashboard/general`
- `/(dashboard)/dashboard/goals`
- `/(dashboard)/dashboard/leaks`
- `/(dashboard)/dashboard/ltv`
- `/(dashboard)/dashboard/mission-control`
- `/(dashboard)/dashboard/monthly-expenses`
- `/(dashboard)/dashboard/notifications`
- `/(dashboard)/dashboard/orders`
- `/(dashboard)/dashboard/other-fees`
- `/(dashboard)/dashboard/pnl`
- `/(dashboard)/dashboard/product-intel`
- `/(dashboard)/dashboard/products`
- `/(dashboard)/dashboard/profit`
- `/(dashboard)/dashboard/report-guide`
- `/(dashboard)/dashboard/reports`
- `/(dashboard)/dashboard/revenue-by-date`
- `/(dashboard)/dashboard/risk`
- `/(dashboard)/dashboard/saved-views`
- `/(dashboard)/dashboard/scheduled-reports`
- `/(dashboard)/dashboard/security`
- `/(dashboard)/dashboard/settings`
- `/(dashboard)/dashboard/settings/api-keys`
- `/(dashboard)/dashboard/settings/audit-log`
- `/(dashboard)/dashboard/settings/jobs`
- `/(dashboard)/dashboard/simulator`
- `/(dashboard)/dashboard/stores`
- `/(dashboard)/dashboard/tax`
- `/(dashboard)/dashboard/team`
- `/[locale]`
- `/[locale]/[slug]`
- `/about`
- `/admin`
- `/admin/blogs`
- `/admin/blogs/[id]`
- `/admin/blogs/new`
- `/admin/users`
- `/auth/2fa-setup`
- `/auth/2fa-verify`
- `/auth/accept-invite`
- `/auth/error`
- `/auth/forgot-password`
- `/auth/login`
- `/auth/register`
- `/auth/reset-password`
- `/beprofit-alternative`
- `/best-shopify-profit-tracker`
- `/blog`
- `/blog/[slug]`
- `/calculators`
- `/calculators/[slug]`
- `/cod-profit-tracking-shopify`
- `/compare`
- `/compare/profitcalc-io`
- `/contact`
- `/data-deletion`
- `/docs/api`
- `/dpa`
- `/dropshipping-profit-tracker`
- `/features`
- `/multi-currency-profit-tracking`
- `/multi-store-profit-tracking`
- `/onboarding`
- `/` (root homepage)
- `/portal/[token]`
- `/pricing`
- `/printful-profit-tracker`
- `/printify-profit-tracker`
- `/privacy-policy`
- `/profitario-alternative`
- `/refund-policy`
- `/sellerboard-alternative`
- `/shared/[token]`
- `/shopify-ad-spend-profit-tracker`
- `/shopify-cogs-tracker`
- `/shopify-net-profit-tracker`
- `/shopify-profit-analytics`
- `/shopify-profit-and-loss-report`
- `/shopify-profit-calculator`
- `/shopify-profit-tracker-vs-spreadsheet`
- `/terms-of-service`
- `/trueprofit-alternative`
- `/use-cases`
- `/vat-shopify-profit-tracking`
- `/welcome`

(98 pages)


## 4. API routes (136 `route.ts` files)

- `/api/ad-accounts/[id]`
- `/api/ad-accounts/google/auth`
- `/api/ad-accounts/google/callback`
- `/api/ad-accounts/meta/auth`
- `/api/ad-accounts/meta/callback`
- `/api/ad-accounts/meta/data-deletion`
- `/api/ad-accounts/meta/deauthorize`
- `/api/ad-accounts/pinterest/auth`
- `/api/ad-accounts/pinterest/callback`
- `/api/ad-accounts/snapchat/auth`
- `/api/ad-accounts/snapchat/callback`
- `/api/ad-accounts/sync`
- `/api/ad-accounts/tiktok/auth`
- `/api/ad-accounts/tiktok/callback`
- `/api/ad-accounts/tiktok/sync`
- `/api/admin/blogs`
- `/api/admin/blogs/[id]`
- `/api/admin/blogs/categories`
- `/api/admin/blogs/tags`
- `/api/admin/jobs`
- `/api/admin/jobs/run`
- `/api/admin/security`
- `/api/admin/users`
- `/api/agency/clients`
- `/api/agency/clients/[id]`
- `/api/ai-insights`
- `/api/alerts`
- `/api/alerts/[id]`
- `/api/analytics/ad-health`
- `/api/analytics/anomalies`
- `/api/analytics/cohorts`
- `/api/analytics/conversion`
- `/api/analytics/copilot`
- `/api/analytics/countries`
- `/api/analytics/f1`
- `/api/analytics/forecast`
- `/api/analytics/leaks`
- `/api/analytics/meta-attribution`
- `/api/analytics/mission-control`
- `/api/analytics/product-intel`
- `/api/analytics/profit`
- `/api/analytics/revenue-by-date`
- `/api/analytics/rfm`
- `/api/auth/2fa/disable`
- `/api/auth/2fa/enable`
- `/api/auth/2fa/setup`
- `/api/auth/2fa/trusted-check`
- `/api/auth/2fa/verify`
- `/api/auth/[...nextauth]`
- `/api/auth/forgot-password`
- `/api/auth/register`
- `/api/auth/reset-password`
- `/api/auth/sessions`
- `/api/auth/verify-email`
- `/api/auth/verify-email/resend`
- `/api/billing/cancel`
- `/api/billing/checkout`
- `/api/billing/portal`
- `/api/billing/webhook`
- `/api/blogs`
- `/api/blogs/[slug]`
- `/api/blogs/categories`
- `/api/blogs/tags`
- `/api/bundles`
- `/api/cogs`
- `/api/comments`
- `/api/couriers`
- `/api/couriers/alerts`
- `/api/couriers/import-csv`
- `/api/couriers/metrics`
- `/api/couriers/recommend`
- `/api/couriers/shipments`
- `/api/couriers/shipments/[id]`
- `/api/cron/alerts`
- `/api/cron/anomaly-scan`
- `/api/cron/apikey-reset`
- `/api/cron/backfill-cogs`
- `/api/cron/dunning`
- `/api/cron/goal-alerts`
- `/api/cron/profit-report`
- `/api/cron/purge`
- `/api/cron/refresh-ad-spend`
- `/api/cron/rollup-daily`
- `/api/cron/scheduled-reports`
- `/api/cron/sync-stores`
- `/api/docs/openapi`
- `/api/fx/rates`
- `/api/gateways`
- `/api/goals`
- `/api/health`
- `/api/keys`
- `/api/keys/rotate`
- `/api/monthly-expenses`
- `/api/notifications`
- `/api/notifications/slack-test`
- `/api/notify-rules`
- `/api/orders`
- `/api/orders/[id]`
- `/api/orders/import`
- `/api/other-fees`
- `/api/privacy/delete`
- `/api/privacy/export`
- `/api/products`
- `/api/products/[id]`
- `/api/ready`
- `/api/reports`
- `/api/risk/backfill`
- `/api/risk/blocklist`
- `/api/risk/review`
- `/api/risk/stats`
- `/api/saved-views`
- `/api/saved-views/[id]/share`
- `/api/scheduled-reports`
- `/api/settings/notifications`
- `/api/settings/workspace`
- `/api/shared-views/[token]`
- `/api/stores`
- `/api/stores/[storeId]`
- `/api/stores/[storeId]/sync`
- `/api/stores/shopify/auth`
- `/api/stores/shopify/callback`
- `/api/stores/shopify/sync`
- `/api/team`
- `/api/team/accept-invite`
- `/api/team/invite`
- `/api/team/members`
- `/api/trial/status`
- `/api/upload/cloudinary`
- `/api/usage`
- `/api/user`
- `/api/v1/cogs`
- `/api/v1/orders`
- `/api/v1/summary`
- `/api/webhooks`
- `/api/webhooks/[id]`
- `/api/webhooks/shopify/[topic]`

Route-auth scan (`npx tsx scripts/audit-routes.ts`, run 2026-10-29 on this tree): 136 routes scanned; policies: session 67, session-direct 26, oauth-state 5, webhook-signed-request 2, public 13, webhook-paddle 1, cron-secret 12, api-key 3, webhook 1. **6 routes flagged UNCOVERED by the scanner (Phase 1 must verify each by reading the code — the scanner detects patterns, not behaviour):** `analytics/ad-health`, `analytics/countries`, `analytics/leaks`, `analytics/mission-control`, `analytics/revenue-by-date`, `shared-views/[token]`. Note the V3 report claimed 117 routes / 0 uncovered; the tree has since grown to 136, and these 6 are new-or-changed since that claim.

## 5. Cron / background jobs

`vercel.json` schedules **12** cron routes; `src/lib/jobs.ts` registers **11**
jobs. Mapping (verified by reading each route):

| Schedule (UTC, `vercel.json`) | Route | Job / implementation |
|---|---|---|
| `0 * * * *` | `/api/cron/sync-stores` | `sync-stores` |
| `0 */6 * * *` | `/api/cron/refresh-ad-spend` | `refresh-ad-spend` |
| `0 8 * * *` | `/api/cron/goal-alerts` | `goal-alerts` |
| `0 9 * * *` | `/api/cron/dunning` | `dunning` |
| `0 7 * * *` | `/api/cron/anomaly-scan` | `anomaly-scan` |
| `0 6 * * 0` | `/api/cron/backfill-cogs` | `backfill-cogs` |
| `0 3 * * *` | `/api/cron/rollup-daily` | `rollup-daily` |
| `0 5 * * *` | `/api/cron/scheduled-reports` | **standalone** — does NOT go through `CRON_JOBS`/`cron-runner`, so it has no registry idempotency key or overlap protection of its own (it is day-gated: Mondays + 1st of month). Phase 1 item. |
| `30 8 * * *` | `/api/cron/alerts` | `guardrail-alerts` (route name ≠ job name — intentional, but confusing) |
| `0 6 * * *` | `/api/cron/profit-report` | `profit-report` |
| `0 4 * * *` | `/api/cron/purge` | `purge-deleted-accounts` |
| `0 0 1 * *` | `/api/cron/apikey-reset` | `apikey-reset` |

All routes are `CRON_SECRET`-guarded (`verifyCronAuth`) + rate-limited. No
orphan cron route and no unscheduled registered job remain (the gap PR #21
closed). Caveat: Vercel cron-count limits depend on the deployment plan
(unknown here); if the plan rejects 12 crons, that surfaces at deploy time.
All job times are UTC; per-team timezone handling inside jobs is a Phase 1
check (brief §C).

Background work that is NOT cron: Shopify webhooks (order/refund/fulfillment/
product/GDPR/uninstall ingestion), `after()` post-response work (risk scoring,
notifications), and the `rollup-daily` cache recompute. There is no separate
worker/queue process — everything runs inside Next.js route handlers.

## 6. Environment variable inventory

Source of truth: `src/lib/env.ts` (zod, fail-fast in production). Required in
production: `AUTH_SECRET` (≥16 chars), `MONGODB_URI`, `PADDLE_API_KEY`,
`PADDLE_WEBHOOK_SECRET`, `CRON_SECRET` (≥16 chars). Everything else is
optional in the schema — including `ENCRYPTION_KEY` (≥32 chars when present),
which means **OAuth tokens are stored unencrypted when it is absent**
(`.env.example` says so honestly; Phase 1 must decide whether to fail fast
instead).

Inventory (code-referenced via `process.env` in `src/`, plus config-only):

- **Core:** `MONGODB_URI`, `AUTH_SECRET`, `NEXTAUTH_SECRET` (legacy name still
  referenced — check which one NextAuth actually reads in Phase 1),
  `NEXT_PUBLIC_SITE_URL`, `LOG_LEVEL`, `ENFORCE_CSRF`, `CRON_SECRET`
- **Billing:** `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV`,
  12 `NEXT_PUBLIC_PADDLE_*_PRICE_ID` (starter/growth/pro ×
  monthly/quarterly/semiannual/annual)
- **Encryption:** `ENCRYPTION_KEY`, `ENCRYPTION_KEYS_JSON` (v2 keyring —
  **missing from `.env.example`**; rotation script `rotate:keys:dry` exists)
- **Shopify:** `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`
- **Ads:** `META_APP_ID/SECRET`, `GOOGLE_ADS_CLIENT_ID/SECRET`,
  `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`,
  `TIKTOK_APP_ID/SECRET`, `PINTEREST_APP_ID/SECRET`,
  `SNAPCHAT_CLIENT_ID/SECRET`
- **Comms/AI/uploads:** `RESEND_API_KEY`, `EMAIL_FROM`, `OPENAI_API_KEY`,
  `OPENAI_MODEL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `NEXT_PUBLIC_WHATSAPP_NUMBER`, `CLOUDINARY_*` (3), `GOOGLE_CLIENT_ID/SECRET`
  (Google sign-in)
- **Infra:** `UPSTASH_REDIS_REST_URL/TOKEN` (optional distributed rate limit),
  `SENTRY_DSN`, plus `SENTRY_ORG`/`SENTRY_PROJECT` (read only by
  `next.config.ts` for source-map upload, not by `env.ts`)
- **Toggles:** `AD_MOCK_MODE`, `USE_MOCK_ADS` (dev/test only, refused in
  production), `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`
- **`.env.example`-only (no code reference found):** `WHATSAPP_BUSINESS_ID`
  (dead or read elsewhere — Phase 1 to confirm and prune)
- **README-only (no code reference anywhere in `src/`):**
  `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`,
  all `DODO_*` vars, `AUTH_URL` (NextAuth may read it internally, but no
  code reference exists), `PAYMENT_GATEWAY`

## 7. README claims: NOT implemented, partial, or NOT tested

Evidence is a grep, a file read, or a command result — not an impression.

| # | README claim | Verdict | Evidence |
|---|---|---|---|
| R1 | Billing is pluggable: Dodo Payments (default) or Paddle via one env var | **NOT implemented (stale)** | `grep -rli dodo src` (excluding tests) = 0 files. `.env.example` header: "Paddle billing (the only payment provider)". D8 in DECISIONS confirms Paddle-only. README billing table + env block + footer ("Built with … Dodo Payments") are all stale. |
| R2 | Clone from `https://github.com/your-username/profit.git` | **Wrong** | Real repo is `MadiWebDev/profit-calculator`. The README URL is a template placeholder that was never replaced. |
| R3 | "PDF export on Pro" under Reports & Export | **Partial** | `/api/reports` has no PDF code path (grep `pdf` = 0 hits). PDF exists only as scheduled-report email attachments (`src/lib/email.ts` + `jspdf`, built in the parity phase). On-demand report PDF is missing. |
| R4 | "Viewer-role members get a dedicated read-only dashboard" | **Overstated** | No `/dashboard/viewer` page exists (dashboard dir listing, §3). Viewer enforcement is real but different: `permissions.ts` (`viewer: 0`, read-only) + `RoleGate`/sidebar filtering on the shared dashboard. Whether write buttons are actually hidden/disabled for viewers everywhere is a Phase 1 check. |
| R5 | Encryption is "AES-256 via `crypto-js`" | **Outdated** | Current code is versioned AES-256-GCM (`encryption-v2.ts`, `ENCRYPTION_KEYS_JSON`); CryptoJS is only the legacy decrypt path (`decryptAny`). README describes the old system as the current one. |
| R6 | Env block lists GA/AdSense vars; analytics wiring implied | **NOT implemented** | `grep GA_MEASUREMENT\|ADSENSE src` = 0 hits. `ConsentScripts.tsx`/`CookieConsent.tsx` exist (consent UI), but no GA/AdSense integration code was found. |
| R7 | Project-structure tree in README | **Stale** | Omits parity pages, `/portal/[token]`, `/auth/2fa-setup`, `/dpa`, security dashboard, cron routes, scheduled-reports, and ~40 newer lib modules. `docs/ROUTES.md` is likewise stale (says 89 routes; actual 136 API + 98 pages). |
| R8 | Ad spend "synced" from Meta, Google, TikTok, Pinterest, Snapchat | **Code-present, live-UNVERIFIED** | Sync libs + OAuth routes exist for all 5 (`src/lib/sync/*-ads.ts`, `ad-accounts/*` routes). Only Meta is hardened/tested (token refresh, repull tail, UTM attribution). No live credentials exist here for any platform, so no end-to-end sync has ever been demonstrated for Google/TikTok/Pinterest/Snapchat. Per the brief: do not call these "done" until a live round-trip runs. |
| R9 | Slack alerts for goal progress | **Code-present, behaviour-UNVERIFIED** | `alert-channels.ts` + `/api/notifications/slack-test` exist; whether the goal-alerts job actually delivers Slack messages (vs. email only) was not traced in Phase 0 — Phase 1 item. |
| R10 | "No console errors; Lighthouse 90+" (brief DoD; README implies quality via badges) | **NOT tested** | No Lighthouse run appears in any report (FINAL_REPORT, V3, or this audit). Playwright browser tests were UNVERIFIED in every prior report for the same VM reason (chromium download). Phase 0 does not claim this either way. |
| R11 | CI runs lint, typecheck, test, build, e2e, npm audit on every PR | **Partially broken** | `.github/workflows/ci.yml` DOES exist (added since the old "no CI" note) with lint/typecheck/test/build jobs. But the `e2e` job runs `npx playwright test` with **no server start step**, and `playwright.config.ts` sets `webServer: undefined` — the e2e job cannot pass as written (connection refused on :3000). And there is **no `npm audit` job** at all. Both are Phase 1 fixes. |
| R12 | "PWA: service worker + Web App Manifest" | **Files present, wiring-UNVERIFIED** | `public/manifest.json` + `public/sw.js` exist. Whether the layout registers the worker (and it works offline/installable) was not verified in Phase 0. |
| R13 | 14-day free trial, audit log (19 action types, 1-year TTL), API-key hashing, trial/plan caps | **Implemented (spot-checked)** | `trial.ts`, `AuditLog` TTL model, `ApiKey` SHA-256 hashing, `plans.ts` caps (50/100/1000/unlimited orders; 1/1/2/unlimited stores) match the README table. The "19 action types" count itself was not recounted in Phase 0. |

Claims verified as implemented in Phase 0 (not exhaustive): true-profit engine
fields, risk scoring, courier module (generic adapter + CSV only — named
adapters still need the courier list), Meta attribution, notifications
(WhatsApp/email), daily rollups, bundles, simulator, LTV/cohorts, goals,
scheduled reports, team roles, 2FA, agency portal, DPA page, privacy export +
account deletion (`/api/privacy/export`, `/api/privacy/delete`, purge job),
cookie consent UI, onboarding page, calculators, docs/API page, data-deletion
page, GDPR webhook handlers (real export since PR #21).

## 8. Open pull requests (5) and open issues (0) — verdicts

Checked live via the GitHub API on 2026-10-29. **Open issues: none**
(`search_issues state:open` → `total_count: 0`). All 5 open PRs are
Dependabot bumps, all `mergeable_state: "unstable"` (= mergeable, no
conflicts, per the precedent from PRs #10/#13/#19/#20/#21). None needs a code
fix; none is a feature. Verdict for all five: **MERGE** — with one ordering
note and one process note:

| PR | Change | Verdict |
|---|---|---|
| #18 | `jose` 6.2.10 → 6.2.13 (patch; JWT library — auth-critical) | **MERGE first.** Patch-only, release notes are refactors; this is the one dependency that touches session/JWT handling, so it deserves the earliest slot. |
| #14 | `react-dom` + `@types/react-dom` 19.2.8 → 19.3.1 (patch, kept in lockstep) | **MERGE.** Same React 19 line; no API change. |
| #17 | `@radix-ui/react-radio-group` 1.4.7 → 1.5.1 (minor) | **MERGE.** UI primitive; minor bump, no breaking change indicated. |
| #16 | `react-day-picker` 10.0.1 → 10.0.2 (patch) | **MERGE.** Date-picker patch. |
| #15 | `@tiptap/extension-underline` 3.31.3 → 3.32.0 (minor) | **MERGE.** Blog-editor extension; minor bump. |

Process note: because the CI `e2e` job is broken (R11) and there is no audit
job, these PRs cannot be green-gated by CI alone. Gate them locally
(lint + tsc + test + build on the merged tree) or fix CI first in Phase 1
and let CI gate them. PR #21 (the complete-Shopify/SaaS branch) is **not**
open — it was merged by the user into `main` (now `667d1cf`) before this
audit started, which is why this audit's base already contains it.

## 9. What Phase 1 inherits (already found, not yet fixed)

These are Phase 0 observations, carried into Phase 1 as its work list — they
are NOT fixed by this document:

1. **Money is float + `round()` to 2dp** (`profit-engine.ts`), not integer
   minor units or a decimal library. Phase 1 §A decides and proves with
   40+ hand-computed cases.
2. **6 routes flagged uncovered by the route-auth scanner** (§4). Each must
   be read: genuinely public-by-design (token-gated shared views?) or a real
   auth gap.
3. **CI e2e job starts no server; no `npm audit` job** (R11).
4. **`/api/cron/scheduled-reports` bypasses `cron-runner`** (§5) — no
   registry idempotency/overlap protection.
5. **`ENCRYPTION_KEY` is optional in `env.ts`** — tokens stored unencrypted
   when absent. Decide: fail fast in production or keep the fallback.
6. **`NEXTAUTH_SECRET` vs `AUTH_SECRET`** — both referenced; confirm which
   NextAuth v5 actually reads and prune the other.
7. **Docs drift** — README structure tree, `docs/ROUTES.md` (89 vs 136),
   README billing/Dodo/GA sections (§7). Phase 4 rewrites; Phase 1 fixes
   anything a user could act on wrongly.
8. **Live-provider verification debt (unchanged from every prior report):**
   Shopify dev-store round-trip, live Paddle sandbox checkout, live ad
   syncs, axe/Lighthouse, 100k-order performance — all still UNVERIFIED
   and all need credentials/access the VM does not have.

## 10. Phase 0 gates (this machine)

| Gate | Result (this machine, branch `audit/v2-phase-0`, main `667d1cf`) |
|---|---|
| `npm run lint` | PASS, 0 errors, 0 warnings |
| `npx tsc --noEmit` | PASS (no output) |
| `npm test` (Vitest) | **462 passed, 0 failed (39 files)** — same count as the PR #21 branch, as expected: `main` now contains #21 |
| `npm run build` | PASS — "Compiled successfully in 115s" (standalone output) |
| Playwright `e2e/smoke.spec.ts` (real Chromium 1248 via temp local config, dev server :3000) | **5/5 passed with MongoDB running.** First run without a database: 4/5 — the readiness probe test hit Playwright's 30s timeout because `/api/ready`'s Mongo ping takes the full 30s server-selection timeout when Mongo is down (endpoint itself correctly returns 503 + `{"status":"not_ready"}`; with Mongo up it answers in 28ms). That slow-fail probe is a Phase 1 reliability item (§C), not a broken endpoint. Temp Playwright config was deleted after the run, never committed. |
| `npx tsx scripts/audit-routes.ts` | 136 routes scanned; 6 flagged uncovered (see §4) |
| `npm audit` | Not run in Phase 0 — the registry returned 403 in every prior run from this VM, and the brief's audit job belongs to Phase 1 (§E), where it will be attempted and reported honestly, including a 403 if it recurs. |

## 11. What I need from you (Phase 0 → Phase 1)

Nothing is blocking Phase 1 from starting — it is a code audit and the code
is here. The following will be needed before Phase 1 can *close* (not start):
(1) Shopify dev-store + app credentials for the live round-trip; (2) Paddle
sandbox keys for live checkout/webhook verification; (3) ad-platform test
accounts (Meta at minimum) for live sync verification; (4) the courier list
(still open since 2026-10-25) if named courier adapters are to be built in
Phase 2; (5) decisions: P&L headline profit definition, and whether
`ENCRYPTION_KEY` should fail fast in production. Per the brief, Phase 1
continues next unless you say stop — no merge of the Phase 0 branch is
assumed; the branch is pushed and a PR opened for you to merge.
