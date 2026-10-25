# Navigation Parity — Final Status (branch parity/profitcalc-parity)

Every page from the ProfitCalc.io sidebar in the brief is now "have" in
GetProfitCalc, plus the beating features in Phase 4. "Have" means the
page renders, loads real team-scoped data, and has loading / empty /
error states — not that every external dependency is verified live
(see UNVERIFIED below).

## Competitor pages

| Page | Status | Route | Tests |
|---|---|---|---|
| Dashboard | have | `/dashboard` | existing suite |
| Order Profitability | have | `/dashboard/orders`, `/dashboard/profit` | existing suite |
| Profit Trends | have | `/dashboard/profit` | existing suite |
| Lifetime Value | have | `/dashboard/ltv` | existing suite |
| Product Profitability | have | `/dashboard/product-intel` | existing suite |
| Product Conversion | have | `/dashboard/conversion` | parity e2e (unauth 401/redirect) + engine tests |
| P&L Report | have | `/dashboard/pnl` | existing suite; reconciliation note in NAV_PARITY.md |
| Country Analysis | have | `/dashboard/countries` | parity e2e + engine tests |
| Mission Control | have | `/dashboard/mission-control` | parity e2e |
| Report Guide | have | `/dashboard/report-guide` | parity e2e |
| Revenue By Date | have | `/dashboard/revenue-by-date` | parity e2e + engine tests |
| COGS Hub | have | `/dashboard/cogs-hub` | parity e2e |
| Monthly Expenses | have | `/dashboard/monthly-expenses` | parity e2e + allocation tests |
| Ad Platforms | have | `/dashboard/ad-platforms` | parity e2e |
| Other Fees | have | `/dashboard/other-fees` | parity e2e + preview function in route |
| Gateway | have | `/dashboard/gateways` | parity e2e |
| General | have | `/dashboard/general` | parity e2e |
| Currency | have | `/dashboard/currency` | parity e2e |
| VAT | have | `/dashboard/tax` | parity e2e |
| Connect Stores | have | `/dashboard/stores` | parity e2e |

## Beating features (Phase 4)

| Feature | Route / API |
|---|---|
| Fake-order risk + courier optimization, top-level | `/dashboard/risk`, `/dashboard/couriers` (pre-existing, kept top-level) |
| Profit Leak Detector → Mission Control | `/dashboard/leaks`, `/api/analytics/leaks` |
| AI Copilot over aggregates (no PII), numbers cited | `/dashboard/copilot`, `/api/analytics/copilot` |
| Weekly digest by email/WhatsApp | `/dashboard/scheduled-reports`, `/api/cron/scheduled-reports` |
| Saved views + custom dashboards, shareable read-only links with expiry | `/dashboard/saved-views`, `/dashboard/custom-dashboard`, `/shared/[token]` |
| Scheduled reports (PDF/CSV) to email | `/dashboard/scheduled-reports`, `/api/cron/scheduled-reports`, `sendScheduledReportEmail` in `src/lib/email.ts` (CSV attachment, or a generated PDF via jsPDF) |

## Cross-page consistency

`src/lib/__tests__/parity-reports.test.ts` proves, for a seeded
dataset: period total = sum of country rows = sum of campaign rows =
sum of daily rows = sum of monthly rows, to the cent, for revenue,
net profit, COGS, ad spend, and order count; cancelled orders are
excluded everywhere. The P&L relationship (dashboard ad spend vs
allocated ad spend + extended other costs) is documented in
`docs/NAV_PARITY.md` and deliberately not forced into a false exact
match — changing the P&L headline would rewrite historical reports
and needs an explicit user decision (see Manual Steps §4).

## Gates run on this branch

- ESLint: PASS (0 errors, 0 warnings after fixes)
- TypeScript (`tsc --noEmit`): PASS
- Vitest: **419 passed, 0 failed** (413 pre-existing + 6 new parity tests)
- Production build (`npm run build`, Next.js 16.3.3): PASS — all
  new pages and APIs listed in the build output (see
  `~/workspace/build-parity.log` on the build machine; the log itself
  is not committed).
- Playwright: new `e2e/parity.spec.ts` added (unauthenticated
  redirect/401 surface for every new page and API). Browser runs in
  this VM remain UNVERIFIED for the pre-existing reason: the
  installed Chromium (1187) does not match `@playwright/test`'s
  expected build (1248) and the download fails here. Run
  `npx playwright install chromium && npx playwright test` on a
  machine with browser downloads.

## Honest gaps (not hidden)

1. **Conversion data:** needs the merchant install in Manual Steps §2.
   Scheduled-report PDFs are simple generated summaries (jsPDF), not
   branded multi-page reports — that polish is a follow-up, the file
   itself is real.
3. **Live round-trips:** Shopify dev store, live Paddle/Meta/WhatsApp,
   and the 50k-order / 2s-per-page performance claim are UNVERIFIED
   in this VM (no credentials, no 50k dataset seeded). Indexes exist
   on team+date, team+store, and the new models; rollups remain the
   existing DailyRollup cache. A 50k-order load test on staging is
   the remaining Phase 5 step before claiming the performance bar.
4. **Accessibility/mobile:** pages use the existing Card/Input/Button
   primitives, semantic tables, aria labels on loading/error states,
   and overflow-x tables for mobile; no axe/Lighthouse run was
   possible in this VM (same browser-download blocker as Playwright).
