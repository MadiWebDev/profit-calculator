# Complete Shopify application + SaaS hardening

Branch: `shopify-complete-saas` (from main `1c2bece`). This closes the
verifiable gaps found in the post-merge audit of main. Nothing here
changes billing providers, pricing, or the P&L profit definition — those
are user decisions (see "Still user-side" below).

## What was built

### Shopify app completeness
- **GDPR `customers/data_request` now exports real data.** Previously the
  handler only logged and returned an empty set. It now compiles the
  customer's order records (excluding merchant-internal analytics:
  profit, COGS, risk scores, ad-spend allocation) and emails the JSON
  export to the store owner, who forwards it to the requester.
  (`src/lib/gdpr-export.ts`, webhook route, `sendGdprExportEmail`.)
- **Customer redaction now covers all customer PII on orders** (name,
  phone, shipping/billing locality, browser IP), not just the email.
- Webhook topics, HMAC verification, OAuth scopes
  (`read_orders, read_products, read_inventory, read_customers,
  read_fulfillments, read_shipping`), uninstall handling, and shop
  redaction were already complete and were verified, not rebuilt.

### SaaS hardening
- **Session lifetimes:** 30-day absolute cap, 7-day idle timeout
  (activity recorded in `User.lastSeenAt`, at most once per 5 minutes
  per session), 24-hour token refresh. (`src/lib/session-policy.ts`,
  `auth.config.ts`, `auth.ts`.)
- **Team-enforced 2FA is now enforced.** `Team.twoFactorRequiredForAdmins`
  was a field only. Owner/admin members of such teams must now enrol
  before using the dashboard: password logins are flagged in
  `authorize()`, OAuth logins at the next periodic session check, and
  the dashboard layout redirects to a new `/auth/2fa-setup` page
  (manual secret entry — no QR library is bundled). The setup/enable
  APIs accept pending sessions, like the verify API already did.
- **Agency client portal:** the `/portal/[token]` page the agency API
  already linked to now exists — public, token-gated (SHA-256 hash,
  expiry), read-only, showing linked stores with live order counts.
  Plus `PATCH /api/agency/clients/[id]` to link stores (only the
  agency team's own stores can be linked).
- **DPA page** at `/dpa`, written against measures the product actually
  has (AES-256-GCM encryption, per-team isolation, audit log, GDPR
  webhooks). Sub-processors are named by category with the full list
  available on request, so the page cannot silently go stale.
- **Crons completed:** new `purge-deleted-accounts` and `apikey-reset`
  jobs + routes, and `vercel.json` now wires every existing cron route
  (rollup-daily, scheduled-reports, guardrail alerts, profit-report)
  — previously only 6 of 12 routes were scheduled.
- **Test harness fix:** `setup-db.ts` now creates `.mongo-mem`, so
  fresh clones no longer fail every DB-backed suite.

## Gates (branch)
Lint, tsc, full test suite, and production build — see the PR body
for the numbers from the actual run.

## Still user-side (not decided or not verifiable in this environment)
- Live Shopify dev-store round-trip (OAuth + sync + webhooks) — needs
  Shopify app credentials and a dev store.
- Live Paddle sandbox checkout and PricePreview against real price ids.
- P&L headline profit definition (parity vs current page) — open decision.
- Courier named adapters — no list was ever supplied; generic adapter +
  CSV remain.
- Encryption keyring rotation, CI file via web UI, conversion tracking.
- Shopify App Store listing strategy: the app is a standalone SaaS
  with Paddle billing, not an embedded admin app with Shopify Billing.
  Listing as a public Shopify app would require that rebuild; this
  branch completes the integration instead. That is a product decision,
  not something to do silently.
