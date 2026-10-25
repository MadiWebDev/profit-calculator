# Audit — profit-calculator before the Shopify-only rebuild

Date: 2026-10-25. Scope: the repo as cloned at `58246bb` (main).
Method: full file inventory (408 tracked files), targeted reads of the
sync/profit/webhook/billing/auth libraries, and a baseline gate run.
This audit describes what was already working; the rebuild refactors it
incrementally and does not rewrite it from scratch.

## Baseline gates (pre-change, this machine)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) — the 117-error state in `docs/BASELINE.md` (2026-10-16) is stale |
| `npm test` (vitest) | 8 files pass, 7 fail — all 7 fail only because `mongodb-memory-server` cannot `scandir` the missing `.mongo-mem` directory (see Fix below) |
| `npm run build` | Not run pre-change (needs env); run after each phase instead |

Fix applied during audit: `mkdir -p .mongo-mem`. That directory is
gitignored project scratch, not source. Test files that need Mongo must
still be re-run after the fix to confirm green.

## Architecture

- **Stack (kept):** Next.js 16.3.3 App Router + React 19 + TypeScript,
  Tailwind v4, MongoDB via Mongoose 9, NextAuth v5 (credentials + Google),
  Paddle Billing, Resend email, Sentry, Vitest + Playwright, Docker +
  docker-compose, GitHub Actions CI. No stack change was needed; the
  blockers were product scope and missing modules, not the framework.
- **Layout:** `src/app/` — public marketing/blog/calculators pages,
  `(dashboard)/dashboard/*` SaaS screens, `api/*` route handlers
  (89 routes documented in `docs/ROUTES.md`), `admin/*` super-admin.
  `src/lib/` — pure engines (`profit-engine`, `fx`, `analytics`,
  `reporting`), sync libraries (`sync/*`), cross-cutting
  (`auth`, `encryption`, `rate-limit`, `csrf`, `jobs`, `entitlements`,
  `permissions`, `audit`, `logger`, `validation`).
  `src/models/` — 19 Mongoose models, incl. `Store`, `Order`, `Product`,
  `AdAccount`, `AdSpendDaily`, `Subscription`, `Team`, `AuditLog`,
  `WebhookEvent`, `Notification`.
- **Tenancy:** every order/product/store query is scoped by `teamId`
  (and usually `storeId`); unique index on
  `(teamId, storeId, externalId)` for orders makes sync idempotent.
- **Money contract (good, kept):** `src/lib/profit-engine.ts` is pure,
  well-documented and tested: revenue is tax-exclusive and already net
  of discounts; discounts/shipping-revenue/taxes are memos, never
  double-counted; refunds/chargebacks reduce net revenue; all outputs
  rounded to 2dp; non-finite inputs coerce to 0. Period summaries apply
  the same formula to summed components, so period profit ≈ Σ order
  profit. FX conversion is explicit (`convertCurrency`, rates quoted
  per 1 USD) and throws on unknown currencies rather than silently
  passing amounts through.

## What already works (do not rewrite)

- Shopify OAuth (state-nonce CSRF, offline tokens, AES-encrypted at
  rest), webhook registration, HMAC-SHA256 verification with
  `timingSafeEqual`, idempotent order upserts, paginated REST sync
  with 429/Retry-After and call-limit backoff, incremental sync via
  `lastSyncAt`, plan order caps, cron sync.
- Mandatory GDPR webhooks (`customers/data_request`,
  `customers/redact`, `shop/redact`) — see Limitations.
- Profit engine, what-if simulator, bundles, COGS rules + CSV import
  + inline editing, product profitability, goals, LTV/cohorts,
  forecast/anomaly detection, CSV reports, scheduled email reports
  (cron: goal alerts, dunning, anomaly scan, ad-spend refresh).
- Meta/TikTok/Google/Pinterest/Snapchat ad-account OAuth and daily
  spend sync; Meta spend detection is real, not a stub.
- Paddle checkout/portal/cancel/webhook (signature-verified, deduped,
  ordering-guarded), trial + usage entitlements enforced server-side
  in most routes, roles/permissions, team invites, audit log,
  notifications, API keys (v1, scoped), outbound webhooks, health +
  ready endpoints, structured logging with secret redaction,
  rate limiting, secure headers, Dockerfile, CI.
- Marketing surface: landing, pricing, features, comparison, blog +
  admin, public calculators directory, privacy/terms/refund, SEO
  (sitemap, robots, OG image), dark mode, PWA install prompts.

## Bugs and gaps found (the rebuild's work list)

1. **Non-Shopify store platforms:** the removed platforms' OAuth/sync/token-refresh and REST sync/validate exist end to end (routes, libs,
   models fields, onboarding steps, UI copy, docs, tests, the
   the removed platform REST client dependency). Phase 1 removes all
   of it; see `docs/DECISIONS.md`.
2. **Shopify webhooks incomplete:** registered/handled topics cover
   orders + refunds + GDPR only. Missing: `fulfillments/create`,
   `fulfillments/update`, `products/update`, `app/uninstalled`
   (uninstall currently only surfaces via GDPR `shop/redact`, 48h
   later). Refund webhook increments `refundAmount` but does not
   recompute `netProfit`/`profitMargin`.
3. **Sync is REST-only, not GraphQL**, and imports orders with
   `totalCogs = 0`, `shippingCost = 0`, `transactionFees = 0` — real
   profit only appears after manual COGS entry. No fallback to
   Shopify variant "cost per item", no gateway-fee or shipping-cost
   capture, no product/variant import. `ordersCount` is overwritten
   with the current run's count instead of the store total.
4. **Profit formula incomplete vs. the spec:** no packaging/handling
   cost, no per-gateway COD/payment fees, no Shopify subscription
   share, no RTO loss, no fixed/variable expense allocation, no
   tax-inclusive/exclusive mode, no stored FX rate at order time,
   no COD cash-collected-vs-pending split. `Order.netRevenue`
   comment says "gross − discounts" but the code computes
   gross − refunds − chargebacks (code is right, comment is wrong).
5. **No fake-order detection, no courier module, no order-status
   messaging automation.** Only churn-risk (LTV page) and a share-via-
   WhatsApp button exist. These are new modules, not fixes.
6. **Meta ads hardening gaps:** no documented token-refresh path in
   the sync library, no explicit last-3-days re-pull for delayed
   reporting, no UTM→order attribution (spend is store-level only),
   so per-campaign true profit and break-even ROAS are not computed
   from attributed orders.
7. **Mock ads in production paths:** `src/lib/ads/mock.ts` and
   `USE_MOCK_ADS` exist; the rebuild must ensure mock data can never
   be served in production (env-gated, dev/test only) — see Phase 5.
8. **GDPR redaction is partial:** customer redact unsets only
   `customerEmail` on orders (no name/phone because those fields are
   not stored — acceptable, but must be documented); shop redact
   deletes orders but leaves products, ad accounts and notifications.
9. **Marketing copy contradicts the product:** landing/pricing/
   comparison pages still advertise multi-platform support and a
   testimonial from a seller on a removed platform. Phase 1 rewrites
   that copy to Shopify-only.
10. **No `.env.example` in the repo** (env vars are only listed in
    the README, which is already out of sync). Phase 1 adds a complete
    one; `src/lib/env.ts` is the source of truth for it.
11. **Test harness:** `.mongo-mem` missing breaks all DB tests
    (above). Also `docs/BASELINE.md`/`docs/SECURITY-REPORT.md` describe
    a 2026-10-16 state that no longer matches (lint now passes,
    GDPR webhooks now exist, API version is now `2026-10`).

## Dead code / removal candidates (Phase 1)

- `src/lib/sync/<removed-platform>.ts` (x2),
  `src/lib/<removed-platform>-token.ts`, `src/app/api/stores/<removed-platform>/*` (x2), removed-platform branches in
  `src/app/api/stores/route.ts`, `src/app/api/stores/[storeId]/sync/route.ts`,
  `src/lib/jobs.ts`, `src/lib/disconnect.ts`, `src/lib/env.ts`,
  `src/middleware.ts`, `src/models/Store.ts` (`wooSiteUrl`,
  `<removed-platform>ShopId`), onboarding steps, dashboard/settings copy, public-page
  copy, docs mentions, `sync-mappers` tests for those platforms,
  the removed platform REST client.
- Kept deliberately: `csv_manual` stores (CSV import is the
  "import data" onboarding step, not a competing platform), all
  ad-platform integrations (Meta/TikTok/Google/Pinterest/Snapchat
  are ad channels, not store platforms), the public calculators
  directory (marketing/SEO content, not store-platform code).

## Security notes (from source + docs/SECURITY-REPORT.md)

- Good: HMAC + timing-safe compare, OAuth state nonces, AES token
  encryption (`ENCRYPTION_KEY`, 32+ chars), Zod validation on most
  API routes, per-route rate limits, CSRF tokens on mutations,
  Paddle signature verification, secret-redacting logger, Sentry.
- Residual, to be closed in Phase 8: confirm every new route added
  by this rebuild uses `requireAuth` + team scoping + Zod +
  rate limiting; confirm `USE_MOCK_ADS` cannot be enabled in
  production; re-run the Phase 8 checklist (headers, indexes,
  pagination, queue DLQ, log review) against the new modules.
- No hardcoded secrets were found in source (env-var references
  only); the README's example env block contains placeholder values,
  replaced by `.env.example` in Phase 1.
