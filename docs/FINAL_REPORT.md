# Final Report — Shopify-only rebuild (Phases 1–9)

**Repo:** https://github.com/MadiWebDev/profit-calculator.git
**Branch to merge:** `shopify-rebuild` — **PUSHED 2026-10-25**, head
`b1a3200` (remote `main` was never touched — it is the live site).
Remote history is a squashed snapshot, not the local phase commits:
branch created at base `58246bb`, one snapshot commit `1e2c841`
(103 added/modified files, local commits `0cec11d..1de7468`),
followed by 9 deletion commits for the Phase 1 removed files, so
the branch content exactly mirrors the local tree. Merging the
branch into `main` is a clean descendant merge from `58246bb`.
**Base:** `58246bb` ("some setup") → 10 phase commits, local `main`
**Date:** 2026-10-25

## What was built

### Phase 1 — Shopify-only cleanup (`0cec11d`)
Removed every trace of the two bolted-on platforms end to end: routes,
sync libraries, OAuth flows, model fields, onboarding steps, UI and
public-page copy, docs, tests, and the WooCommerce REST dependency.
Shopify is the only store platform; CSV import stays as the
history-backfill step. Onboarding simplified to: connect store →
import data → set costs → connect ads → connect couriers.
`scripts/migrate-shopify-only.ts` archives legacy stores (deactivates,
wipes tokens, keeps order history) and prints a JSON report.
**Verified:** case-insensitive grep for the removed platform names =
0 matches (re-verified at the end of Phase 9b, excluding `.git`,
`node_modules`, `.next`, `package-lock.json`, `tsconfig.tsbuildinfo`).

### Phase 2 — Shopify integration (`20f536e`)
GraphQL variant cost-per-item (`shopify-graphql.ts`), webhook topics
for fulfillments, products, app/uninstalled and all mandatory GDPR
topics, dedup via `WebhookEvent` + `X-Shopify-Webhook-Id`, idempotent
upserts, refund webhook that recomputes profit (never increments),
resumable paginated sync with progress fields, `read_shipping`
scope, multi-store + tenant-isolation tests.

### Phase 3 — True profit engine (`d6d45c9`)
Pure `profit-extended.ts`: packaging, COD fee, subscription share,
RTO loss, expense allocation on top of the unchanged core engine.
Dashboard metrics (revenue, net profit, margin, AOV, ROAS, MER,
break-even ROAS, CAC, LTV, return/RTO rates, COD collected vs
pending), previous-period deltas, daily series, winners/losers,
`GET /api/analytics/profit` (+ CSV export), `/dashboard/profit`
page, scheduled profit-report emails, and a P&L money-contract fix
(discounts/shipping revenue are memos inside gross revenue; taxes
are pass-through, no longer subtracted from net profit).

### Phase 4 — Fake/unusual order detection (`f8245a4`)
Explainable 0–100 scoring engine (`risk-engine.ts`): disposable
email, gibberish names, velocity, blocklist, RTO history, value /
quantity outliers, odd hours, billing/shipping mismatch, learned
per-product/per-city RTO rates, store-level anomalies. Bands
low/medium/high/critical; high/critical auto-tag in Shopify and
hold fulfilment. Tenant blocklist stores SHA-256 hashes only.
Review queue, precision + money-saved stats, backfill (capped
200/call), webhook scoring via `after()` so scoring never blocks
ingestion. Merchant verdicts adjust bounded weights [0.5, 2.0] only
when the verdict contradicts the score band. Money saved = gross
value protected by blocking a fake order; realised RTO loss is
reported separately and never mixed in.

### Phase 5 — Meta ads hardening (`6d80db5`)
Production guard refusing `AD_MOCK_MODE`, incremental sync window
(lastSyncAt − 3 days, delayed-reporting repull tail), proactive +
on-190 token refresh (encrypted storage), rate-limit retries with
Retry-After, ad-account timezone for API date ranges, spend kept in
account currency. Orders now store `source`/`utmCampaign`/
`landingSite` parsed from the landing URL. New
`GET /api/analytics/meta-attribution`: UTM-only per-campaign true
profit + break-even ROAS, unattributed spend reported separately,
FX conversion to store currency (503 when FX is unavailable and
currencies differ), previous-period alerts. Ad-spend page gains a
true-profit table with alerts. Sync stays campaign-level — ad
set/ad breakdown needs a new upsert key and a migration for legacy
rows (see Open items).

### Phase 6 — Courier module (`cdedf8b`)
`Courier` (encrypted API key, never returned) and `Shipment`
models; generic tracking adapter + CSV import (upsert by
team+courier+trackingNumber; bad rows reported with line numbers;
tracking-less rows rejected so re-imports never duplicate);
per-courier / per-city / per-region metrics; best-courier ranking
with a 20-shipment minimum sample and confidence levels; switching
profit impact; stuck (>5d), COD settlement (>7d) and high-RTO-area
alerts; `/dashboard/couriers` page. Terminal shipments write back
to linked orders (delivered → actual shipping cost; RTO → cost +
packaging as rtoLoss; net profit recomputed, except inclusive-tax
orders where recompute is skipped for lack of a stored tax rate).
**Only the generic adapter ships** — no named courier API was
invented (see the question for you below).

### Phase 7 — SaaS/UX readiness (`49a3303`)
Subscription gating (402 for archived accounts) added to every new
write route; onboarding checklist fixed (COGS was hardcoded false;
ads and couriers steps were missing) — all six steps now computed
from the database. Verified present, not rebuilt: landing, pricing,
SEO, legal pages, dark mode, notifications bell + center API,
audit log, team invites, Paddle billing with trial. Roles kept as
owner/admin/member/viewer (staff = member, accountant = viewer);
renaming would break existing teams.

### Phase 8 — Security/perf/reliability (`2481847`)
Route audit: every new route has auth + team scope + Zod + rate
limit. Verified existing: CSP/X-Frame/HSTS headers, NextAuth
session middleware, HMAC webhooks, `/api/health` + `/api/ready`,
Dockerfile with healthcheck, GH Actions CI. New: `DailyRollup`
model + `jobRollupDaily` (last 7 complete days, idempotent
upserts, per-team failure isolation) + cron route — rollups are a
cache, live orders remain the source of truth. `ensure-indexes.ts`
now imports the Phase 4/6/8 models.

### Phase 9a — WhatsApp/email automation (`58039d5`)
`NotifyRule` per event (channel whatsapp/email/both, enabled) and
`NotificationLog` (audit + dedup on team/order/event/channel,
masked recipients, no message bodies stored). Sender bridge:
Meta WhatsApp Cloud API text messages + Resend email, driven by
pure `whatsapp.ts` templates. Triggers via `after()`: Shopify
webhooks (create → confirmed, cancelled, refunds, fulfillment
shipment_status → shipped/out-for-delivery/delivered) and manual
courier shipment updates, unified by dedup. Generic order updates
never notify. **COD tracking:** enabling the `cod_tracking` rule
swaps the generic shipped message for the COD tracking message
(tracking ID + courier + COD wording) on COD orders with a
tracking number. Cancelled/refund messages never carry a tracking
ID. Merchant UI: `/dashboard/notifications` rules page + API.
No rule, no contact, or no credentials → skipped and logged,
never a blast.

## What was tested (all actually run, 2026-10-25)

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | PASS |
| ESLint (`npm run lint`) | PASS, 0 errors |
| Unit + integration tests (`npm test`, Vitest) | **362 passed, 0 failed** (25 files) |
| Production build (`npm run build`) | PASS (all new routes listed, incl. `/dashboard/risk`, `/dashboard/couriers`, `/dashboard/notifications`, `/api/analytics/meta-attribution`, `/api/cron/rollup-daily`) |
| Removed-platform grep (case-insensitive) | **0 matches** |
| TODO/FIXME in `src` (excl. tests) | **0** (only legitimate form `placeholder` attributes remain) |
| Playwright smoke (`e2e/smoke.spec.ts`) vs local dev server | **3 passed** (health/ready probes, OpenAPI spec, unknown-route 404). **2 browser tests UNVERIFIED** — see below |
| Shopify dev-store end-to-end (import, order, refund, cancellation, fulfilment) | **UNVERIFIED** — see below |

### Honest UNVERIFIED items (not claimed as passed)
- **Playwright browser tests (homepage + cookie banner):** fail only
  because the installed browser (chromium-1187) does not match the
  version the installed `@playwright/test` expects
  (chromium_headless_shell-1248), and downloading the matching
  browser fails in this VM (download error from the CDN). The 3
  API-level smoke tests pass against a live dev server. Fix on a
  machine with browser downloads: `npx playwright install chromium`,
  then `npx playwright test`.
- **Shopify dev-store round-trip:** no dev store, Shopify app
  credentials, Meta app, WhatsApp Cloud API credentials, or Paddle
  production keys exist in this VM, so no live round-trip was run.
  Webhook, sync, scoring, courier and notification paths are covered
  by integration tests with in-memory Mongo and stubbed fetch, not
  by a live store.
- **Zero console errors in a browser:** not claimed — it depends on
  the browser run above.
- **Meta ad-set/ad-level breakdown:** not built (see Phase 5 note).

## Decisions
Full rationale lives in `docs/DECISIONS.md` (D1–D15) and the audit
in `docs/AUDIT.md`. Headlines: keep the stack, no rewrite; archive
legacy data, never hard-delete; REST sync kept, GraphQL added for
costs; core profit contract unchanged; new logic is pure libraries
first, thin server bridges second; Paddle stays (standalone SaaS,
not an embedded Shopify app); mock ad mode is dev/test only and
refused in production.

## What needs your manual action (in order)
1. **Merge:** the work is already pushed to remote branch
   `shopify-rebuild` (head `b1a3200`); merge it yourself — remote
   `main` was deliberately never touched (it is the live site).
   Then run `scripts/migrate-shopify-only.ts` once against
   production data to archive any legacy stores.
2. **Courier list (question for you):** which couriers do you use?
   Only the generic adapter + CSV fallback exist today. Send the
   list (e.g. TCS, Leopard, M&P, DHL…) and whether you have API
   credentials for any of them, and named adapters will be added.
3. **Shopify app:** create/confirm the app, set the OAuth env vars,
   register the webhook topics, and run the dev-store round-trip
   (import, new order, refund, cancellation, fulfilment) to close
   the UNVERIFIED item above.
4. **Meta:** app review + `META_APP_ID`/`META_APP_SECRET`, connect an
   ad account, and confirm the account currency vs store currency.
5. **WhatsApp:** set `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ID`; get message
   templates approved in Meta — the sender sends free-form text,
   which Meta only accepts inside an open customer-service window,
   so production use needs approved templates or window-aware
   sending. Then enable rules at Dashboard → Notifications.
6. **Billing + deploy:** Paddle production keys, `CRON_SECRET` for
   the cron routes (incl. the new `rollup-daily` job — add it to
   your cron schedule, daily), run `scripts/ensure-indexes.ts`
   once per deploy, and set the production env from
   `.env.example` (complete; never hardcode secrets).
7. **Ad set/ad breakdown** (optional follow-up): needs a new
   `AdSpendDaily` upsert key + migration for legacy campaign-only
   rows; say the word and it will be built as its own phase.
