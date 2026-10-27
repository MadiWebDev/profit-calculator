# Navigation Parity Audit — ProfitCalc.io sidebar vs GetProfitCalc

**Base:** `origin/main` at `b460720` (shopify-rebuild PR #10 + advanced PR #11
already merged). **Branch:** `parity/profitcalc-parity`.
**Method:** every existing dashboard route was listed from
`src/app/(dashboard)/dashboard/` and its page/client/API files were
inspected; the competitor sidebar below is the list supplied in the
brief (their site was not scraped and no competitor code was copied).
Status is therefore about *our* pages, verified from our own tree.

## Their sidebar → our pages

| Their page | Our page | Status | Gaps at audit time |
|---|---|---|---|
| Dashboard | `/dashboard` (Overview) | have | — |
| Order Profitability | `/dashboard/orders` + `/dashboard/profit` | have | Orders page is the per-order view; True Profit is the trend view. Both kept. |
| Profit Trends | `/dashboard/profit` | have | Daily series + previous-period deltas already existed. |
| Lifetime Value | `/dashboard/ltv` | have | LTV & cohort already existed. |
| Product Profitability | `/dashboard/product-intel` | have | Product intelligence (ranking, break-even, movers) from PR #11. |
| Product Conversion | — | missing → built | No funnel events existed. Built: `/dashboard/conversion` + `ConversionEvent` model + API. See Manual Steps for the pixel/ShopifyQL install. |
| P&L Report | `/dashboard/pnl` | have | See the reconciliation note below. |
| Country Analysis | — | missing → built | Built: `/dashboard/countries` + API, city drill-down, suggested actions. |
| Mission Control | — | missing → built | Built: `/dashboard/mission-control` + API (today vs goal, 5 actions, health, anomalies, data health score). |
| Report Guide | — | missing → built | Built: `/dashboard/report-guide` (searchable glossary; every new metric tooltip links here). |
| Revenue By Date | — | missing → built | Built: `/dashboard/revenue-by-date` + API (daily/weekly/monthly, dow/hour patterns, best/worst, comparison). |
| COGS Hub | `/dashboard/products` (partial) → built | partial → built | Products page edited COGS per product but had no hub view, missing-COGS filter, bulk % apply, or CSV export. Built: `/dashboard/cogs-hub`. |
| Monthly Expenses | — | missing → built | Built: model + API + `/dashboard/monthly-expenses`, allocated into profit-before/after-operating-expenses. |
| Ad Platforms | `/dashboard/ad-spend` (partial) | partial → built | Ad Spend ranked campaigns but had no per-platform health or reconciliation delta. Built: `/dashboard/ad-platforms` + ad-health API. |
| Other Fees (submenu) | — | missing → built | Built: model + API + `/dashboard/other-fees` (effective dates, scoping, preview). |
| Gateway | — | missing → built | Built: model + API + `/dashboard/gateways` (detected gateways, fee schedules, recompute preview). |
| General | `/dashboard/settings` (partial) | partial → built | Settings had profile/billing/stores/ad-accounts/notifications tabs but no fiscal-month, default-range, or profit-definition page. Built: `/dashboard/general` + workspace settings API. |
| Currency | `/dashboard/settings` (team currency only) | partial → built | Built: `/dashboard/currency` + FX source + manual overrides with effective dates. |
| VAT | — | missing → built | Built: `/dashboard/tax` + workspace settings (mode, per-country rates, reverse charge). |
| Connect Stores | `/dashboard/settings?tab=stores` (partial) | partial → built | Built: `/dashboard/stores` (list, re-sync, disconnect, sync status/log summary). |

## New sidebar structure (Phase 0)

OVERVIEW: Dashboard, Mission Control
PROFIT: Order Profitability, Product Profitability, Profit Trends, P&L Report,
Revenue By Date, Country Analysis, Product Conversion, Lifetime Value,
Customers, Report Guide
COSTS: COGS Hub, Products, Monthly Expenses, Ad Platforms, Ad Spend, Other Fees
PROTECT: Fake-Order Risk, Alerts, Profit Leak Detector
LOGISTICS: Couriers, Shipments (→ Couriers), COD Cash Flow (section of True Profit)
GROWTH: Goals, Simulator, Bundles, AI Copilot, Saved Views, Scheduled Reports, Reports
SETTINGS: General, Stores, Gateways, Currency, Tax/VAT, Notifications, Team,
API & Webhooks, Billing, Audit Log, Jobs, All Settings

Features: collapsible groups (persisted in localStorage), Ctrl+K search that
filters pages (Enter goes to the first match), active state, and a live badge
on Alerts counting currently-triggered guardrail rules. Team/Billing/API Keys/
Audit Log/Jobs are shown only to owner/superAdmin platform roles; team-level
write permissions are still enforced server-side on every API route
(viewers are read-only there), because the sidebar only receives the
platform role, not the team role.

Old URLs all still work: every pre-existing route above is unchanged, and
`next.config.ts` redirects renamed/alias URLs (e.g. `/dashboard/shipments` →
`/dashboard/couriers`, `/dashboard/true-profit` → `/dashboard/profit`).

## Reconciliation note (read before comparing P&L to the new pages)

All new parity pages (Revenue By Date, Countries, Conversion, Mission
Control, Leaks, Copilot) aggregate with `src/lib/parity-reports.ts`, which
applies `calcTrueNetProfit` per order and sums — so their totals agree
with each other and with `/api/analytics/profit` for the same period,
store, and currency filter, to the cent.

The pre-existing P&L page differs in two documented ways and was NOT
silently changed (changing it would rewrite historical reports):
1. It uses **AdSpendDaily dashboard spend** instead of ad spend
   allocated to orders.
2. It does not subtract the extended other-costs bucket
   (packaging, COD fee, subscription share, RTO loss, expense allocation).

So: `P&L net profit = parity net profit + extended other costs
+ (allocated ad spend − dashboard ad spend)`. The Phase 5 consistency
test asserts the parity pages agree exactly, and asserts the P&L
relationship with those two adjustments spelled out — not a false
exact match.

## What this branch deliberately does NOT claim

- Live Shopify dev-store round-trip, live Paddle/Shopify/Meta/WhatsApp
  credentials, and Playwright browser runs in this VM are UNVERIFIED
  (same blockers as the 2026-10-25 final report: no credentials in the
  VM, Playwright browser download fails here). API-level tests pass.
- Conversion data requires the merchant to install tracking
  (docs/MANUAL_STEPS.md); until then the page says so explicitly.
- "Beating" features that need a human (legal review of the moderation
  policy, courier API credentials) are listed in Manual Steps, not faked.
