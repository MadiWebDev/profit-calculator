# Manual Steps — things that need your credentials or your click

Nothing here is done by the agent, because it needs access only you have.
Everything else in the parity branch is code, tests, and docs.

## 1. Merge and deploy this branch

1. Open a PR from `parity/profitcalc-parity` into `main` and merge it
   yourself — `main` is the live site and is never touched by the agent.
2. Deploy, then run `scripts/ensure-indexes.ts` once per deploy
   (new models: ConversionEvent, MonthlyExpense, OtherFeeRule,
   GatewayFee, SavedView, ScheduledReport, WorkspaceSettings).
3. Add the new cron route to your cron schedule (same CRON_SECRET as
   the existing crons): `GET /api/cron/scheduled-reports`
   — weekly reports send on Mondays, monthly on the 1st.

## 2. Conversion tracking (for the Product Conversion page)

Until you do one of these, `/dashboard/conversion` honestly shows
"conversion tracking is not enabled yet" and visitor rates stay 0.

Option A — ShopifyQL / reports import (no app install):
1. In Shopify Admin → Analytics, export or query sessions/orders by
   product and UTM source for the period you want.
2. Import the rows via the authenticated endpoint
   `POST /api/analytics/conversion` with
   `{ storeId, productId?, productName?, source?, sessionKey, step, occurredAt }`
   where step is one of `view | add_to_cart | checkout | purchase`.
   `sessionKey` must be an anonymous session identifier, never an
   email, name, or customer ID.

Option B — pixel app extension (ongoing, recommended):
1. Create a Shopify app extension (web pixel) in your Shopify app
   that fires `view`, `add_to_cart`, `checkout`, and `purchase`
   events to `POST /api/analytics/conversion` with an API key for
   your team (create one at Dashboard → API & Webhooks).
2. The extension needs the `read_analytics` scope if you read
   ShopifyQL directly; the pixel path needs no new customer-data
   scope because it only sends anonymous session keys.

## 3. Accounts and credentials (unchanged from the 2026-10-25 report)

- Shopify app + OAuth env vars + webhook topics, then a dev-store
  round-trip (import, order, refund, cancellation, fulfilment).
- Meta app review + `META_APP_ID` / `META_APP_SECRET`; connect an ad
  account and confirm account currency vs store currency.
- WhatsApp Cloud API credentials + approved message templates
  (free-form text only works inside an open customer-service window).
- Paddle production keys.
- Courier list: which couriers do you use, and do you have API
  credentials for any? Only the generic adapter + CSV import ship
  today; named adapters are a follow-up once you name them.

## 4. After merging

- Set COGS for any product the COGS Hub flags as missing — profit on
  those products is overstated until then.
- Set a profit goal (Goals page) so Mission Control's "today vs
  target" has a target.
- Create your first saved view and scheduled report, and share a
  read-only link with an accountant to test the expiry flow.
- If you want the P&L headline to adopt the parity definition
  (allocated ad spend + extended other costs), say so explicitly:
  that changes historical P&L numbers and needs a migration note,
  so it was deliberately not done silently in this branch.

---

## Security & Features V3 (branch security/hardening-v3)

Steps only the merchant (account holder) can do. Everything else in
this branch is code + tests and ships with the branch.

## 1. Merge and deploy

1. Merge this branch into main yourself (main is the live site; this
   branch never touches it).
2. Run `npx tsx scripts/ensure-indexes.ts` once after deploy — it
   creates indexes for SecurityEvent, SessionDevice, ClientWorkspace,
   Comment, and IdempotencyKey.
3. Deploy with the env vars below; the app refuses to boot in
   production with placeholder/weak AUTH_SECRET or CRON_SECRET.

## 2. Encryption keyring (S2.1) — irreversible decision, read first

New writes use AES-256-GCM with a versioned keyring. To migrate
existing tokens:

1. Set `ENCRYPTION_KEYS_JSON` to `{"v1":"<old ENCRYPTION_KEY hex>","v2":"<new 64-hex key>"}`.
   Generate a new key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Keep the old key in the keyring until the rotation script reports 0 failures.
2. Set `ENCRYPTION_CURRENT_KEY_ID=v2`.
3. Run `npx tsx scripts/rotate-encryption-keys.ts --dry-run` — confirm
   `failed: 0`.
4. Run `npx tsx scripts/rotate-encryption-keys.ts --apply`.
5. Only then remove `v1` from the keyring (and only if no legacy rows
   remain — re-run --dry-run to confirm `scanned` is all current-version).
6. NEVER commit a key to git. If a key ever leaks, rotate immediately
   (see docs/INCIDENT_RESPONSE.md) and scan history with gitleaks.

## 3. CI security job (S4)

Copy `docs/security/CI-SECURITY.yml` to `.github/workflows/security.yml`
via the GitHub web UI (the GitHub App cannot push workflow files).
Pin each action by SHA from its release page at that time — the
template deliberately uses version tags, not unverified SHAs.

## 4. Cron jobs to add

- Weekly: `npx tsx scripts/purge-deleted-accounts.ts --apply` (deletion
  grace-period purge; run --dry-run first).
- Daily: a job that resets ApiKey.recentUseCount (anomaly window) —
  e.g. a cron route or a scheduled script; until it exists, the
  recentUseCount grows monotonically and the >200/hour anomaly flag
  will fire once and stay warm. See FINAL_REPORT_V3 open items.

## 5. Accounts / credentials needed for live verification

- Shopify dev store (GDPR webhook round-trip, live sync).
- Meta/TikTok/Google ad accounts (live token round-trip).
- Paddle (live billing webhook — signature verification is unit-tested
  with fixtures, not live).
- Resend (security alert emails are no-ops without RESEND_API_KEY).
- ZAP + a running app (run scripts/zap-baseline.sh, commit the report
  to docs/security/).

## 6. Decisions only you can make (irreversible)

- **P&L headline definition**: unchanged in this branch (same note as
  parity: dashboard ad spend vs allocated spend + extended other
  costs). Changing it rewrites historical reports.
- **Key rotation cutover** (§2 step 5): removing the old key is
  irreversible for any unmigrated rows.
- **Data deletion**: accounts past the 14-day grace period are
  hard-deleted by the purge script — there is no undo.
- **Billing changes**: SSO (when built) is a Pro/agency entitlement;
  pricing for it is a business decision, not in this branch.
