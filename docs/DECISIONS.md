# Decisions

Architectural decisions for the Shopify-only rebuild. Each entry records
the choice, the reason, and what was rejected.

## D1 — Keep the existing stack (no rewrite)

Next.js 16 + React 19 + TypeScript + Tailwind + MongoDB/Mongoose +
NextAuth + Paddle + Resend is kept. The audit found the stack sound:
typecheck and lint pass, the profit engine is pure and tested, and the
Shopify sync/webhook/billing foundations are real. Rewriting would
discard verified behaviour for no product gain. Rejected: a fresh
codebase, and migrating to Postgres/Prisma mid-rebuild (a migration
that size belongs in its own project, with its own data-migration plan).

## D2 — Shopify is the only store platform; CSV stays

Removed platforms are deleted end to end (routes, sync libs, token
helpers, model fields, onboarding steps, UI copy, docs, tests, and
their REST client dependency). CSV import stays because it is the
"import data" onboarding step, not a competing platform: it lets a
merchant backfill history without a second integration. Rejected:
keeping removed platforms "just in case" (that is exactly the scope
creep the rebuild removes), and deleting CSV import (merchants would
lose their only history backfill).

## D3 — Archive, don't delete, legacy store data

`scripts/migrate-shopify-only.ts` deactivates legacy-platform stores,
wipes their tokens, and marks them disconnected, but leaves their
orders in place. Deleting order history would silently rewrite a
merchant's past profit reports. The script prints a JSON archive
report so the operator keeps a record. Rejected: hard-deleting legacy
orders, and silently re-labelling legacy stores as Shopify stores
(that would be false data).

## D4 — REST sync kept, GraphQL added for product costs

The existing REST order sync is rate-limit aware, paginated,
incremental and idempotent, and it works. Phase 2 keeps it for orders
and adds a GraphQL client for product/variant cost data (the Admin
REST product endpoints do not expose variant cost as cleanly), rather
than rewriting a working sync to GraphQL wholesale. Rejected: a
full GraphQL rewrite in Phase 2 (high risk, no merchant-visible gain
over the hybrid).

## D5 — Profit engine extended, not replaced

Phase 3 adds an extended breakdown (packaging, gateway/COD fees,
subscription share, RTO loss, expense allocation, tax mode, stored FX
rate) as new fields/functions alongside the existing engine, keeping
the existing `calcOrderProfit` signature and its tests green. The
money contract (tax-exclusive revenue, memos never double-counted,
2dp rounding, non-finite inputs coerce to 0) is unchanged. Rejected:
changing the core formula in place (would break existing reports and
tests) and a second, parallel profit engine (two sources of truth).

## D6 — Risk, courier and messaging are pure libraries first

The new scoring, courier-ranking and message-template logic live in
pure, dependency-free modules (`src/lib/risk-engine.ts`,
`src/lib/courier.ts`, `src/lib/whatsapp.ts`) with unit tests, and are
only then wired into webhooks, API routes and dashboard pages. Pure
first means the scoring and ranking rules are testable without a
database, and a webhook failure can never take down order ingestion.
Rejected: putting scoring/ranking SQL or fetch calls directly in the
webhook handler.

## D7 — Mock ad data is dev/test only, never production

`USE_MOCK_ADS` / `AD_MOCK_MODE` remain as explicit env gates, but
Phase 5 adds a production guard: mock mode is refused when
`NODE_ENV === "production"`. Fixture data may exist in tests and in
the clearly separated dev seed path; it must never reach a merchant's
dashboard. Rejected: removing the fixtures entirely (they make the
ad-sync tests deterministic without network access).

## D8 — Paddle stays the billing provider

The repo already bills through Paddle with signature-verified,
deduped webhooks, trials and plan entitlements. Shopify Billing API
is not used because this is a standalone SaaS (merchants sign up on
the marketing site), not an embedded Shopify app. Rejected: switching
billing providers mid-rebuild, and adding a second billing system.

## D9 — Push to a branch, merchant merges to main

Work lands on branch `shopify-rebuild` and is pushed there after each
phase; main is the live site and is only changed by the merchant's own
merge, as with previous programs. This keeps a broken intermediate
phase from ever reaching production. (See docs/FINAL_REPORT.md for
the merge checklist.)

## D10 — Phase 4: risk scoring design (2026-10-25)
- Scoring is a pure function (`risk-engine.ts`) over an order snapshot plus
  store history; the server bridge (`risk-scoring.ts`) only fetches data
  and persists results. Same decision as D6.
- Money saved = gross value protected when a fake order is blocked before
  fulfilment (engine's `preventedFakeValue`). Realised RTO loss (shipping +
  packaging) is reported separately and never mixed into the money-saved
  total — mixing them was an early draft mistake, corrected before commit.
- The tenant blocklist stores ONLY SHA-256 hashes of normalised
  identifiers (`kind:normalized-value`), never raw phones/emails/addresses.
  A hash hit adds +30 points with an explicit reason, so it is visible
  in the review queue rather than a silent auto-reject.
- Scoring runs after the webhook response via Next.js `after()` so a slow
  score never blocks order ingestion; failures are logged, and the
  merchant can re-score from the review queue or the backfill endpoint.
- Learned per-team signal weights are bounded [0.5, 2.0] and only move
  when a verdict contradicts the score band (fake on a low scorer raises
  weights, genuine on a high scorer lowers them). Consistent verdicts
  leave weights untouched, so merchants cannot accidentally train the
  engine to ignore a signal by confirming obvious cases.
- Precision in the stats endpoint is fake/(fake+genuine) over REVIEWED
  orders only; it is labelled as such in the code because unreviewed
  orders have no ground truth.

## D11 — Phase 5: Meta ads hardening (2026-10-25)
- Spend stays stored in the ad account's currency; conversion to the
  store currency happens at attribution-query time with live FX rates.
  If FX is unavailable and currencies differ, the attribution endpoint
  returns 503 rather than reporting unconverted spend as if it were
  store currency.
- Attribution matches orders to campaigns ONLY on UTM (source in
  meta/facebook/instagram + utm_campaign from the landing-page URL,
  case-insensitive). Shopify does not ship parsed UTM fields, so the
  sync now parses landing_site and stores source/utmCampaign/landingSite
  on the order. Unattributed spend is reported separately, never spread.
- Sync granularity stays campaign-level. Ad set/ad breakdown would need
  a new upsert key and a migration for legacy campaign-only rows; it is
  listed as follow-up in the final report instead of being half-built.
- Incremental sync window = lastSyncAt − 3 days (delayed-reporting
  repull tail); first/manual syncs use the full 30-day window.
- AD_MOCK_MODE is refused in production inside syncMetaAdSpend; mock
  spend in production would silently fake the P&L.

## D12 — Phase 6: courier module (2026-10-25)
- Only the generic tracking adapter ships. Named courier APIs are NOT
  invented: the merchant's courier list was never supplied, so the
  final report asks for it. CSV upload is the working fallback, and
  courier API keys (when added) are encrypted and never returned.
- CSV rows without a tracking number are rejected at import, not
  silently created: without an identity, a re-import would duplicate
  shipments. Bad rows are reported with line numbers, never thrown.
- Recommendations require a minimum 20-shipment sample per courier
  and report confidence (low/medium/high); below-sample couriers are
  listed separately and never recommended.
- Profit write-back: delivered shipments set the linked order's
  shippingCost to the actual cost; RTO sets rtoLoss = cost + packaging.
  Net profit is recomputed via calcTrueNetProfit from stored fields —
  except inclusive-tax orders, where recomputation is skipped (no
  stored tax rate) and only the cost fields are updated.
- Switching-profit estimate's lostCostPerRto defaults to the
  destination's current average cost per shipment and is reported in
  the response, so the estimate is auditable rather than hidden.

## D13 — Phase 7: SaaS/UX verification (2026-10-25)
- Roles: the spec names owner/staff/accountant; the repo already ships
  owner/admin/member/viewer with server-side enforcement (permissions.ts
  `can()`, fresh DB role on every mutating route). Renaming roles
  would break existing teams, so the mapping is kept: staff = member
  (write:data), accountant = viewer (read-only). No role rename.
- Billing gating: checkSubscription blocks archived (trial-expired)
  accounts with 402. Phase 7 added that gate to every new write
  route from Phases 4–6 (risk verdicts/backfill/blocklist, courier
  CRUD/CSV/shipments) — reads were already gated.
- Onboarding checklist: previously hardcoded hasCogs=false and had no
  ads/couriers steps. It now computes all six steps from the database
  (store, orders, COGS>0 products, active ad accounts, couriers,
  profit goal) and matches the Phase 1 simplified onboarding.
- Verified present, not rebuilt: landing/pricing/SEO/legal pages,
  dark mode (ThemeProvider + toggle), notifications bell + center API,
  audit log, team invites, Paddle billing with trial/entitlements.

## D14 — Phase 8: security/perf/reliability (2026-10-25)
- Audit result: every new route (Phases 4–6 + meta-attribution) has
  requireAuth + team scoping + Zod validation + rate limiting;
  GET-only routes take no input, so no parser is needed there.
  Security headers (CSP, X-Frame-Options, HSTS) already live in
  next.config.ts; auth is NextAuth session cookies via middleware;
  webhooks are HMAC-verified, never session-based. No new CSRF token
  was invented — same-origin session routes are the existing model.
- Job queue: cron-runner already provides idempotency keys, overlap
  protection and persistent failed/partial run records (the
  dead-letter equivalent: failed runs are visible in CronRun and
  re-claimable). Job-level retries happen by re-triggering, not by
  an in-process retry loop that could double-send emails.
- Rollups: DailyRollup rows are a cache, not a second source of
  truth. The dashboard still aggregates live orders; the rollup job
  recomputes the last 7 days daily so late refunds correct history.
- ensure-indexes.ts now imports the Phase 4/6/8 models so their
  schema indexes are created on deploy, not only by Mongoose
  auto-index in development.

## D15 — Phase 9a: WhatsApp/email automation (2026-10-25)
- Trigger sources: Shopify webhooks (orders-create → confirmed,
  orders-cancelled → cancelled, refunds-create → refund, fulfillment
  shipment_status → shipped/out-for-delivery/delivered) plus manual
  courier shipment updates. Both sources funnel through one dedup
  (team, order, event, channel), so the same stage never messages
  twice even when both fire.
- Generic order updates never notify — only stage changes do.
- COD tracking is a rule, not a separate setting screen: enabling
  the cod_tracking rule swaps the generic shipped message for the
  COD tracking message on COD orders with a tracking number.
- WhatsApp uses the Meta Cloud API text message endpoint (v21.0).
  Template-message approval (24-hour window / template names) is a
  merchant-side Meta setup step, listed in the final report: the
  sender sends free-form text, which Meta only accepts inside an
  open customer-service window, so production use needs approved
  templates or window-aware sending.
- No rule, no contact, or no credentials → skipped and logged, never
  a failed job and never a blast. Message bodies are not stored in
  the log; only masked recipients, status and errors.
