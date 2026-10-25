# Advanced features (post-rebuild)

Three feature slices added on top of the Shopify-only rebuild
(branch `features/advanced`). All three work from real order data only —
no invented integrations, no mock data in production code. New logic
follows decision D6: pure library first, thin server bridge second.

## 1. Product intelligence — `/dashboard/product-intel`

- **Fully-loaded profit ranking** (`src/lib/product-intel.ts`,
  `rankProducts`). Goes beyond the P&L page's gross winners/losers
  (revenue − COGS): each order's non-COGS costs (shipping, transaction
  fees, ad spend, other costs, packaging, COD fee, RTO loss, expense
  allocation) are split across its lines by revenue share, giving a
  fully-loaded profit and margin per product.
- **Break-even price & max discount** (`breakEvenForProduct`). Per-unit
  costs (COGS + shipping + fees + ad spend + other, all revenue-share
  allocated by `src/lib/product-intel-server.ts`) give a break-even
  price, a price for a target margin (page uses 25%, API accepts
  `targetMargin` in [0, 0.95)), and max safe discount headroom below
  the current average price. Priced-below-break-even and losing-money
  products are flagged.
- **Movers** (`productMovers`). Units in the last 30 days vs the prior
  30 days: rising, falling, new, dead, stable.
- API: `GET /api/analytics/product-intel?from&to&storeId&targetMargin`
  (auth + subscription + rate limit, team-scoped).

## 2. Customer RFM — `/dashboard/customers`

- **Segmentation** (`src/lib/rfm.ts`, `segmentCustomers`). Groups
  orders by customer email (lowercased/trimmed; orders without an email
  and cancelled orders excluded) and scores recency, frequency and
  monetary as relative quintiles *within the store's own customers*
  — not absolute benchmarks. Segments, in precedence order:
  champions, loyal, new, at-risk, lost, regular.
- Segment cards show count, revenue, profit and average recency;
  clicking a card filters the customer table (top 100 by profit).
- API: `GET /api/analytics/rfm?from&to&storeId` (default window 365
  days). Server bridge: `src/lib/rfm-server.ts`.

## 3. Guardrails — `/dashboard/alerts`

- **Rules** (`src/models/AlertRule`): a team creates rules on four
  metrics — profit margin, refund rate, RTO rate, average order
  profit — with a below/above operator, a threshold and a window in
  days (1–365).
- **Evaluation** (`src/lib/alerts.ts`, pure): windowed metric values,
  strict `<`/`>` triggering (equality never triggers), warning vs
  critical severity at the 0.5×/1.5× breach bands. No-data windows
  never trigger — an absent signal is not a breach. RTO rate uses
  shipments when any exist, otherwise falls back to orders with RTO
  loss.
- **Delivery** (`src/lib/alerts-server.ts`): triggered rules create
  one in-app Notification each, at most once per rule per 24h
  (cooldown via `lastTriggeredAt`), so a daily cron never spams the
  bell for a breach that stays breached.
- **Cron**: `GET /api/cron/alerts` (CRON_SECRET) runs job
  `guardrail-alerts` (registered in `src/lib/jobs.ts`); add it to the
  daily cron schedule alongside `rollup-daily`.
- APIs: `GET/POST /api/alerts`, `PATCH/DELETE /api/alerts/[id]`
  (write permission + subscription on mutations).

## Gates

- `tsc --noEmit` PASS, `npm run lint` PASS,
  `npm test` 413 passed / 0 failed (362 rebuild tests + 51 new:
  product-intel, RFM, alerts), `npm run build` PASS (new routes in
  the route table).
- Unverified (same standing items as the rebuild): Shopify dev-store
  round-trip, 2 Playwright browser tests (VM browser mismatch).
