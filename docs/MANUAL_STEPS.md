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
