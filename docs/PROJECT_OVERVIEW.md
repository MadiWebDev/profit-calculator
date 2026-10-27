# GetProfitCalc — Complete Project Overview

> **Generated:** Read-only investigation of the `d:\My-Projects\NEXT\profit` workspace (branch `shopify-rebuild`, head `b1a3200`, finalized 2026-10-25).  
> **Sources:** `README.md`, `docs/FINAL_REPORT.md`, `docs/AUDIT.md`, `docs/DECISIONS.md`, `docs/SECURITY-REPORT.md`, `docs/ADVANCED_FEATURES.md`, `docs/ROUTES.md`, `docs/OPERATIONS.md`, all 27 Mongoose model files, `src/middleware.ts`, `src/lib/plans.ts`, `src/lib/permissions.ts`, `src/lib/profit-engine.ts`, `next.config.ts`, `docker-compose.yml`, `vercel.json`, `.env.example`, `.github/workflows/ci.yml`, `e2e/smoke.spec.ts`, `package.json`.

---

## 1. Project Identity

| Field | Value |
|---|---|
| **Product name** | GetProfitCalc |
| **Purpose** | Full-stack SaaS profit-analytics platform for Shopify e-commerce merchants |
| **Tagline** | Track true net profit across orders, products, and ad spend — with AI-powered insights |
| **Target users** | Shopify store owners and their finance/marketing teams |
| **Repository** | `https://github.com/MadiWebDev/profit-calculator.git` |
| **Version** | Next.js 16.3.3, React 19 |
| **Build status** | 413 unit tests passing, 0 failing; `tsc --noEmit` clean; `npm run lint` clean; production build passes |

### What problem it solves

Most Shopify merchants know their gross revenue but not their **true net profit** after COGS, shipping costs, platform/payment fees, ad spend, refunds, chargebacks, RTO losses, and packaging costs are accounted for. GetProfitCalc closes that gap with an income-statement-style breakdown, per-order profitability, and multi-platform ad attribution.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Framework** | Next.js 16.3 — App Router | Server Components, Edge Middleware, standalone Docker output |
| **Language** | TypeScript 5 | Strict mode; `tsc --noEmit` enforced in CI |
| **Frontend** | React 19, Tailwind CSS v4, Radix UI (full suite), Recharts 3, Framer Motion 13 | shadcn-style component library in `src/components/ui/` |
| **Icons** | `lucide-react` | |
| **Forms** | `react-hook-form` + `zod` | Zod v4; validation shared between client and server |
| **Rich text** | Tiptap (blog editor) | Extensions: code blocks, color, highlight, image, link, text-align, underline |
| **Database** | MongoDB 7 via Mongoose 9 | 27 models; Atlas or self-hosted; tenant-isolated by `teamId` |
| **Auth** | NextAuth v5 (Credentials + Google OAuth) | `jose` for JWT; edge-safe config split |
| **Payments** | Paddle (sole gateway) | Webhooks HMAC-verified; 4 billing intervals |
| **Email** | Resend | Transactional only; 4 email templates |
| **WhatsApp** | Meta WhatsApp Cloud API v21.0 | Order event notifications (Phase 9) |
| **AI** | OpenAI SDK — `gpt-4o-mini` (configurable) | Aggregated numbers only sent; no PII to LLM |
| **Encryption** | `crypto-js` AES-256 | OAuth tokens + courier API keys at rest |
| **Passwords** | `bcryptjs` | Never stored in plaintext |
| **CSV** | PapaParse | Order import + shipment import |
| **PDF** | jsPDF + html2canvas | Pro plan only |
| **Image uploads** | Cloudinary | Blog images |
| **Rate limiting** | In-memory sliding window; Upstash Redis optional (distributed) | 100 req/min default |
| **Error tracking** | Sentry (client + server + edge) | `src/instrumentation.ts`, `sentry.*.config.ts` |
| **Testing** | Vitest 5 (unit/integration) + Playwright 1.64 (e2e smoke) | `mongodb-memory-server` for DB tests; `fast-check` for property tests |
| **CI** | GitHub Actions (`.github/workflows/ci.yml`) | lint → typecheck → unit tests → build → e2e |
| **Containerization** | Docker + docker-compose | Node 20 slim; healthcheck via `/api/health` |
| **Deployment** | Vercel (primary) or Docker | 6 Vercel Cron jobs defined in `vercel.json` |
| **PWA** | Service worker + Web App Manifest | Install prompts on marketing pages |

---

## 3. Architecture Overview

```
src/
├── app/
│   ├── (dashboard)/          ← Auth-gated SaaS shell (layout + error + loading)
│   │   └── dashboard/        ← All 18 dashboard pages
│   ├── api/                  ← 89 API routes
│   ├── auth/                 ← Login, register, forgot/reset, accept-invite
│   ├── admin/                ← Platform super-admin (users + blog CMS)
│   ├── onboarding/           ← Post-registration 6-step checklist
│   ├── welcome/              ← Post-billing landing
│   ├── blog/                 ← Public blog (list + slug pages)
│   ├── calculators/          ← SEO free-tool calculator pages
│   ├── pricing/              ← Pricing page (Paddle live prices)
│   ├── features/, about/,    ← Marketing pages
│   │   compare/, contact/,
│   │   docs/api/, data-deletion/,
│   │   privacy-policy/, terms-of-service/,
│   │   refund-policy/
│   └── page.tsx              ← Homepage / landing page
├── components/
│   ├── dashboard/            ← Sidebar, Topbar, StatCard, RoleContext, RoleGate, NotificationBell
│   └── ui/                   ← Full Radix-based component library (shadcn pattern)
├── lib/                      ← Business logic (pure engines + server bridges)
├── models/                   ← 27 Mongoose schemas
├── types/                    ← Shared TypeScript types (calculator.ts)
├── hooks/                    ← React hooks
├── config/                   ← App configuration
├── middleware.ts             ← NextAuth Edge middleware (all routes except public)
└── instrumentation.ts        ← Sentry initialization
```

### Tenancy model

Every database query is scoped by `teamId`. No cross-tenant data is possible by design — the session's `teamId` is always used server-side; client-supplied `teamId` is never trusted.

### Auth flow

1. Edge middleware (`src/middleware.ts`) runs NextAuth on all non-excluded routes.
2. Unauthenticated users are redirected to `/auth/login`.
3. After login, the `teamId` and `teamRole` are embedded in the JWT session.
4. Each API route calls `requireAuth()` which extracts the session, then `requirePermission()` which re-reads the role from the DB for mutation routes (no stale-session risk).

---

## 4. All Pages & Routes

### 4.1 Public / Marketing Pages

| URL | Description |
|---|---|
| `/` | Homepage / landing — hero, feature highlights, social proof, CTA |
| `/pricing` | Pricing table (Paddle live prices, interval toggles: monthly/quarterly/semiannual/annual) |
| `/features` | Full feature list page |
| `/about` | About page |
| `/compare/profitcalc-io` | Competitor comparison page |
| `/contact` | Contact form |
| `/blog` | Blog listing page |
| `/blog/[slug]` | Individual blog post |
| `/calculators` | Calculator directory (SEO) |
| `/calculators/[slug]` | Individual calculator tool |
| `/docs/api` | Public API documentation page |
| `/privacy-policy` | Privacy policy |
| `/terms-of-service` | Terms of service |
| `/refund-policy` | Refund policy |
| `/data-deletion` | Meta app data deletion instructions |
| `/welcome` | Post-signup/billing welcome screen |

### 4.2 Auth Pages

| URL | Description |
|---|---|
| `/auth/login` | Email/password + Google OAuth login |
| `/auth/register` | Account creation (creates user + workspace) |
| `/auth/forgot-password` | Password reset request |
| `/auth/reset-password` | Reset password via token link |
| `/auth/error` | NextAuth error fallback |
| `/auth/accept-invite` | Team invitation acceptance |
| `/onboarding` | 6-step post-registration checklist: connect store → import data → set COGS → connect ads → connect couriers → set profit goal |

### 4.3 Dashboard Pages (all auth-gated, role-filtered)

| URL | Page | Description |
|---|---|---|
| `/dashboard` | **Overview** | KPI cards: revenue, net profit, margin, orders, ROAS. Period-over-period comparison. Flexible date range picker (Today, 7d, 30d, 90d, YTD, custom). |
| `/dashboard/orders` | **Orders** | Full order table with per-order cost breakdown: COGS, shipping, fees, ad spend allocated, refunds, net profit, margin. |
| `/dashboard/products` | **Products** | Per-SKU margin stats. Inline COGS editor with landed cost breakdown: supplier cost, inbound shipping, import duties, packaging, prep, other. |
| `/dashboard/pnl` | **P&L Report** | Income-statement layout: Gross Revenue → Discounts → Net Revenue → COGS → Gross Profit → Operating Expenses → Net Profit. CSV export. |
| `/dashboard/profit` | **Profit Analytics** | True-profit metrics, deltas, daily series, winners/losers. Multi-currency with FX. COD collected vs pending. |
| `/dashboard/ad-spend` | **Ad Spend** | Multi-platform ROAS table. Attribution model toggle (first-click, last-click, linear). Campaign-level drill-down. Per-campaign true profit + break-even ROAS (Meta). |
| `/dashboard/ltv` | **LTV & Cohort** | Customer lifetime value by acquisition-month cohort. Repeat purchase rate. AOV per cohort. |
| `/dashboard/customers` | **Customers (RFM)** | RFM segmentation (champions, loyal, new, at-risk, lost, regular). Segment cards + filterable customer table (top 100 by profit). |
| `/dashboard/product-intel` | **Product Intelligence** | Fully-loaded profit ranking. Break-even price + max discount headroom. Movers (rising/falling/new/dead/stable over 30d vs prior 30d). |
| `/dashboard/bundles` | **Bundles** | Build composite products from existing SKUs. Auto-calculates bundle COGS, gross margin, estimated net margin. |
| `/dashboard/simulator` | **What-If Simulator** | Interactive sliders: selling price, COGS, shipping, fees, ad spend, quantity, refund rate. Outputs profit/unit, total profit, ROI, break-even price/units. Real-time Recharts cost-breakdown chart. No API calls — entirely in-browser. |
| `/dashboard/goals` | **Profit Goals** | Monthly profit target tracking. Color-coded progress (green ≥80%, yellow ≥50%, red <50%). Email + Slack alerts. |
| `/dashboard/reports` | **Reports & Export** | Five CSV report types: Profit Summary, Order Detail, Product Margins, Ad Spend ROI, Tax Estimate. PDF export (Pro plan). |
| `/dashboard/alerts` | **Guardrail Alerts** | Custom alert rules on 4 metrics (profit margin, refund rate, RTO rate, avg order profit). Below/above threshold triggers. |
| `/dashboard/risk` | **Risk / Fake-Order Detection** | Review queue. 0–100 risk scores. Explainable reasons. Merchant verdict feedback. Precision + money-saved stats. |
| `/dashboard/couriers` | **Couriers** | Per-courier/per-city/per-region delivery metrics. Best-courier ranking (20-shipment minimum). Switching profit impact. Stuck + COD settlement alerts. |
| `/dashboard/notifications` | **Notification Rules** | Order event notification rules: confirmed, shipped, out-for-delivery, delivered, cancelled, refund, COD tracking. WhatsApp + email channels. |
| `/dashboard/team` | **Team** | Invite members by email. Manage roles (owner/admin/member/viewer). 48-hour invite links (hashed). |
| `/dashboard/viewer` | **Viewer Read-Only** | Read-only dashboard for Viewer-role members. |
| `/dashboard/settings` | **Settings** | Workspace name, currency, timezone, notification preferences, subscription management. |
| `/dashboard/settings/api-keys` | **API Keys** | Create scoped API keys (owner only). Full key shown once; SHA-256 hash stored. Usage count + last-used timestamp. |
| `/dashboard/settings/audit-log` | **Audit Log** | Timeline of 29 action types. Auto-expires after 1 year (MongoDB TTL). |
| `/dashboard/settings/jobs` | **Background Jobs** | View/run cron jobs manually. |

### 4.4 Admin Pages (platform super-admin)

| URL | Description |
|---|---|
| `/admin` | Admin dashboard |
| `/admin/users` | User management |
| `/admin/blogs` | Blog CMS listing |
| `/admin/blogs/new` | Create new blog post |
| `/admin/blogs/[id]` | Edit blog post (Tiptap rich text editor) |

---

## 5. Complete API Endpoint Reference

### Auth legend
**S** = Session (NextAuth, team-scoped) · **K** = API key (`Bearer <key>`) · **C** = Cron bearer (`CRON_SECRET`) · **W** = Webhook signature (HMAC) · **P** = Public · **A** = Admin (platform super-admin)

### 5.1 Authentication

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | P | Create account + workspace. Sends welcome email. |
| GET/POST | `/api/auth/[...nextauth]` | P | NextAuth handlers (credentials + Google OAuth) |
| POST | `/api/auth/forgot-password` | P | Generate password reset link (1-hour expiry). Enumeration-safe. |
| POST | `/api/auth/reset-password` | P | Validate token hash and update password |
| GET | `/api/auth/verify-email` | P | Verify email via token |
| POST | `/api/auth/verify-email/resend` | P | Resend verification email (rate-limited) |

### 5.2 Stores

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/stores` | S | List connected stores / connect a new store |
| GET, PATCH, DELETE | `/api/stores/[storeId]` | S | Get / update / disconnect a store |
| POST | `/api/stores/[storeId]/sync` | S | Manually trigger Shopify order sync |
| GET | `/api/stores/shopify/auth` | S | Start Shopify OAuth (redirects to Shopify) |
| GET | `/api/stores/shopify/callback` | S | Shopify OAuth callback (stores encrypted token) |
| POST | `/api/stores/shopify/sync` | S | Shopify full/incremental sync |

### 5.3 Shopify Webhooks

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/webhooks/shopify/[topic]` | W (HMAC) | Fan-in webhook handler. Topics: `orders/create`, `orders/cancelled`, `orders/updated`, `refunds/create`, `fulfillments/create`, `fulfillments/update`, `products/update`, `app/uninstalled`, GDPR: `customers/data_request`, `customers/redact`, `shop/redact`. Deduped by `X-Shopify-Webhook-Id`. |

### 5.4 Orders

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/orders` | S | List orders (paginated, date-filtered) / create order |
| GET, PATCH, DELETE | `/api/orders/[id]` | S | Get / update / delete a single order |
| POST | `/api/orders/import` | S | CSV import via PapaParse (upsert by externalId) |

### 5.5 Products & COGS

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/products` | S | List / create products |
| GET, PATCH, DELETE | `/api/products/[id]` | S | Get / update / delete a product |
| GET, POST | `/api/cogs` | S | Get / set COGS rules with landed cost breakdown |

### 5.6 Ad Accounts

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/ad-accounts` | S | List all connected ad accounts |
| GET, DELETE | `/api/ad-accounts/[id]` | S | Get / revoke + clear an ad account |
| GET | `/api/ad-accounts/meta/auth` | S | Start Meta OAuth (state-nonce CSRF) |
| GET | `/api/ad-accounts/meta/callback` | S | Meta OAuth callback → triggers initial spend sync |
| POST | `/api/ad-accounts/meta/deauthorize` | W | Meta deauthorize compliance webhook |
| POST | `/api/ad-accounts/meta/data-deletion` | W | Meta data-deletion compliance webhook |
| GET | `/api/ad-accounts/tiktok/auth` | S | Start TikTok OAuth |
| GET | `/api/ad-accounts/tiktok/callback` | S | TikTok OAuth callback |
| POST | `/api/ad-accounts/tiktok/sync` | S | Manual TikTok spend sync |
| GET | `/api/ad-accounts/google/auth` | S | Start Google Ads OAuth |
| GET | `/api/ad-accounts/google/callback` | S | Google Ads OAuth callback |
| GET | `/api/ad-accounts/pinterest/auth` | S | Start Pinterest OAuth |
| GET | `/api/ad-accounts/pinterest/callback` | S | Pinterest OAuth callback |
| GET | `/api/ad-accounts/snapchat/auth` | S | Start Snapchat OAuth |
| GET | `/api/ad-accounts/snapchat/callback` | S | Snapchat OAuth callback |
| POST | `/api/ad-accounts/sync` | S | Generic sync for any platform |

### 5.7 Analytics

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics/profit` | S | True-profit metrics, period deltas, daily series, winners/losers. `?format=csv` for export. |
| GET | `/api/analytics/meta-attribution` | S | UTM-only per-campaign true profit, break-even ROAS, previous-period alerts. |
| GET | `/api/analytics/cohorts` | S | Monthly customer LTV cohort analysis |
| GET | `/api/analytics/forecast` | S | Damped-trend profit forecast (days + horizon params) |
| GET | `/api/analytics/anomalies` | S | Z-score anomaly detection (metric + days params) |
| GET | `/api/analytics/rfm` | S | RFM customer segmentation (`?from&to&storeId`, default 365-day window) |
| GET | `/api/analytics/product-intel` | S | Fully-loaded product profit ranking, break-even, movers |
| POST | `/api/ai-insights` | S | GPT-4o-mini profit insights (Growth/Pro; daily-cached) |
| GET | `/api/fx/rates` | S | Cached FX spot rates for currency conversion |

### 5.8 Billing — Paddle

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/billing/checkout` | S | Create Paddle checkout transaction |
| GET | `/api/billing/portal` | S | Get Paddle customer portal URL |
| POST | `/api/billing/cancel` | S | Cancel active subscription |
| POST | `/api/billing/webhook` | W (Paddle HMAC) | Signature-verified billing events: `subscription.created`, `subscription.activated`, `subscription.cancelled`, `payment.failed`. Deduped by event_id. Ordering-guarded by `lastEventAt`. |
| GET | `/api/billing/prices` | P | Fetch live Paddle prices (used by pricing page) |

### 5.9 Goals

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/goals` | S | List / create monthly profit goals |

### 5.10 Bundles

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/bundles` | S | List / create product bundles |

### 5.11 Couriers & Shipments

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/couriers` | S | List / create couriers (API keys encrypted, never returned) |
| GET | `/api/couriers/metrics` | S | Per-courier/per-city/per-region delivery metrics |
| GET | `/api/couriers/recommend` | S | Best-courier ranking (20-shipment min sample) |
| GET | `/api/couriers/alerts` | S | Stuck (>5d) + COD settlement (>7d) + high-RTO-area alerts |
| POST | `/api/couriers/import-csv` | S | Shipment CSV import (upsert by team+courier+trackingNumber) |
| GET, POST | `/api/couriers/shipments` | S | List / create shipments |
| GET, PATCH, DELETE | `/api/couriers/shipments/[id]` | S | Get / update / delete a shipment |

### 5.12 Risk / Fraud Detection

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/risk/review` | S | Review queue (high/critical risk, unreviewed orders) |
| POST | `/api/risk/review` | S | Submit merchant verdict (fake/genuine) — triggers weight learning |
| GET | `/api/risk/stats` | S | Precision stats + money-saved metric |
| POST | `/api/risk/backfill` | S | Backfill risk scoring for past orders (capped at 200/call) |
| GET, POST | `/api/risk/blocklist` | S | Read / add entries to tenant blocklist (SHA-256 hashes only) |

### 5.13 Notifications & Alerts

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/notifications` | S | List / create in-app notifications |
| POST | `/api/notifications/slack-test` | S | Send a test Slack notification |
| GET, PATCH | `/api/settings/notifications` | S | Get / update notification preferences |
| GET, POST | `/api/notify-rules` | S | List / create WhatsApp+email notification rules per order event |
| GET, POST | `/api/alerts` | S | List / create guardrail alert rules |
| PATCH, DELETE | `/api/alerts/[id]` | S | Update / delete an alert rule |

### 5.14 Team Management

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/team` | S | Get team details |
| POST | `/api/team/invite` | S | Invite a member by email (48h invite hash) |
| GET, DELETE | `/api/team/members` | S | List / remove team members |
| POST | `/api/team/accept-invite` | P | Accept a team invitation |

### 5.15 API Keys (Pro plan)

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST, DELETE | `/api/keys` | S (owner) | List / create / revoke scoped API keys |
| POST | `/api/keys/rotate` | S (owner) | Rotate an API key |

### 5.16 Reports

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/reports` | S | Generate reports: `?type=profit_summary|order_detail|product_margins|ad_spend_roi|tax_estimate&from=&to=` |

### 5.17 Public REST API v1 (API key, Pro plan)

| Method | Route | Scope | Description |
|---|---|---|---|
| GET | `/api/v1/orders` | `read:orders` | Paginated order list |
| GET | `/api/v1/summary` | `read:reports` | Profit summary for a date range |
| GET, POST | `/api/v1/cogs` | `read:products` / `write:cogs` | Read or update COGS rules |
| GET | `/api/docs/openapi` | P | OpenAPI 3.1 spec |

### 5.18 Outbound Webhooks (Pro plan)

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, POST | `/api/webhooks` | S | List / create outbound webhook subscriptions (secret returned once) |
| DELETE | `/api/webhooks/[id]` | S | Delete a webhook subscription |

Events: `anomaly.detected`, `goal.alert`, `subscription.updated`, `sync.completed`

### 5.19 User & Usage

| Method | Route | Auth | Description |
|---|---|---|---|
| GET, PATCH | `/api/user` | S | Get / update user profile |
| GET | `/api/usage` | S | Usage metrics vs. plan limits |
| GET | `/api/trial/status` | S | Trial status + days remaining |

### 5.20 Uploads

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/upload/cloudinary` | S | Upload image to Cloudinary (blog images) |

### 5.21 Cron Jobs (bearer-secret protected)

| Method | Route | Schedule | Description |
|---|---|---|---|
| GET | `/api/cron/sync-stores` | Hourly | Order sync for all active stores |
| GET | `/api/cron/refresh-ad-spend` | Every 6h | Ad spend refresh across all platforms |
| GET | `/api/cron/goal-alerts` | Daily 08:00 | Goal progress + email/Slack alerts |
| GET | `/api/cron/dunning` | Daily 09:00 | Payment-failure reminder emails |
| GET | `/api/cron/anomaly-scan` | Daily 07:00 | Z-score anomaly detection + notifications |
| GET | `/api/cron/backfill-cogs` | Weekly Sun 06:00 | COGS rule backfill for past orders |
| GET | `/api/cron/alerts` | Daily (manual add) | Guardrail alert rule evaluation |
| GET | `/api/cron/rollup-daily` | Daily (manual add) | Pre-compute DailyRollup cache (last 7 days) |
| GET | `/api/cron/profit-report` | Scheduled | Send scheduled profit report emails |
| GET | `/api/cron/anomaly-scan` | Daily 07:00 | Anomaly detection notifications |
| GET | `/api/cron/backfill-cogs` | Weekly | Retroactive COGS application |

### 5.22 Admin (platform super-admin)

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/users` | A | List all users |
| GET | `/api/admin/jobs` | A | List background jobs + run history |
| POST | `/api/admin/jobs/run` | A | Manually trigger a named job |
| GET, POST | `/api/admin/blogs` | A | List / create blog posts |
| GET, PATCH, DELETE | `/api/admin/blogs/[id]` | A | Manage individual blog posts |
| GET | `/api/admin/blogs/categories` | A | List blog categories |
| GET | `/api/admin/blogs/tags` | A | List blog tags |

### 5.23 Platform Health

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | P | Liveness probe → `{ status: "ok" }` |
| GET | `/api/ready` | P | Readiness probe (MongoDB + Redis) → 200 or 503 |
| GET | `/api/og` | P | Dynamic OG image generation |
| GET | `/api/docs/openapi` | P | OpenAPI 3.1 spec |

### 5.24 Blog (public)

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/blogs` | P | Paginated blog list (rate-limited; Zod-validated pagination) |
| GET | `/api/blogs/[slug]` | P | Single blog post by slug |
| GET | `/api/blogs/categories` | P | Blog category list |
| GET | `/api/blogs/tags` | P | Blog tag list |

---

## 6. Data Models (Mongoose Schemas)

All models are in `src/models/`. Every business model is tenant-isolated via `teamId`.

### 6.1 User (`src/models/User.ts`)

| Field | Type | Notes |
|---|---|---|
| `name`, `email` | String | Email unique, lowercase |
| `password` | String? | bcrypt hash; `select: false`; undefined for OAuth users |
| `image` | String? | Avatar URL |
| `emailVerified` | Date? | Set on verification |
| `teamId` | ObjectId → Team | The user's workspace |
| `platformRole` | `"user" \| "superAdmin"` | Platform-level role |
| `plan` | `"free" \| "starter" \| "growth" \| "pro"` | Cached from Team |
| `trialEndsAt` | Date? | 14-day trial expiry |
| `onboardingCompleted` | Boolean | 6-step checklist completion |
| `failedLoginAttempts` | Number | Lockout counter |
| `lockoutUntil` | Date? | Lockout expiry |
| `passwordChangedAt` | Date? | For session invalidation |
| `emailVerificationTokenHash` | String? | SHA-256 hash; `select: false` |
| `resetPasswordTokenHash` | String? | SHA-256 hash; `select: false` |

### 6.2 Team (`src/models/Team.ts`)

| Field | Type | Notes |
|---|---|---|
| `name`, `slug` | String | Slug unique |
| `ownerId` | ObjectId → User | |
| `members` | ITeamMember[] | Embedded: `userId`, `role`, `inviteTokenHash`, `status` |
| `plan` | `"free"\|"starter"\|"growth"\|"pro"` | |
| `trialEndsAt` | Date? | |
| `subscriptionId` | String? | Paddle subscription ID |
| `paddleCustomerId` | String? | Paddle customer ID |
| `currency`, `timezone` | String | Workspace defaults |

**Team roles:** `owner > admin > member > viewer`

### 6.3 Store (`src/models/Store.ts`)

| Field | Type | Notes |
|---|---|---|
| `platform` | `"shopify" \| "csv_manual"` | Shopify-only post Phase 1 |
| `domain` | String? | e.g. `mystore.myshopify.com` |
| `accessToken`, `refreshToken` | String? | AES-256 encrypted at rest |
| `shopifyShopId` | String? | |
| `syncStatus` | `"idle"\|"syncing"\|"error"\|"never"\|"disconnected"` | |
| `lastSyncAt`, `syncPages`, `syncSyncedCount`, `syncStartedAt` | — | Resumable sync state |
| `ordersCount` | Number | |

### 6.4 Order (`src/models/Order.ts`)

The most complex model — 50+ fields.

**Revenue components:** `grossRevenue`, `discounts` (memo), `netRevenue`, `shippingRevenue` (memo), `taxes` (pass-through)  
**Cost components:** `totalCogs`, `shippingCost`, `transactionFees`, `refundAmount`, `chargebackAmount`, `adSpendAllocated`, `packagingCost`, `codFee`, `subscriptionShare`, `rtoLoss`, `expenseAllocation`, `otherCosts`  
**Computed:** `netProfit`, `profitMargin (%)`  
**Risk fields:** `riskScore (0–100)`, `riskBand`, `riskReasons[]`, `riskStatus`, `riskAutoTag`, `riskHoldFulfillment`, `moneySaved`  
**UTM/Attribution:** `source`, `utmCampaign`, `landingSite`  
**COD:** `paymentMethod`, `codCollected`, `codPending`, `taxMode ("exclusive"|"inclusive")`, `fxRateAtOrder`  
**Customer:** `customerEmail`, `customerName`, `customerPhone`, `shippingCity/PostalCode/Country`, `billingCity/PostalCode`, `browserIp`  

**Indexes:** Unique on `(teamId, storeId, externalId)` for idempotent upserts.

### 6.5 Product (`src/models/Product.ts`)

Per-SKU: `defaultCogs`, `variantCogs[]`, aggregated stats (`totalRevenue`, `totalCogs`, `totalProfit`, `totalOrders`, `avgProfitMargin`).

### 6.6 CogsRule (`src/models/CogsRule.ts`)

Landed cost breakdown: `supplierCost`, `shippingToWarehouse`, `importDuties`, `packagingCost`, `prepCost`, `otherLandedCost`. Full `history[]` (every past COGS value with timestamp and editor). `applyToNewOrders` flag.

### 6.7 AdAccount (`src/models/AdAccount.ts`)

`platform`: `"meta" | "google" | "tiktok" | "pinterest" | "snapchat"`. Encrypted `accessToken`, `refreshToken`. `timezone` (Meta account timezone for correct date ranges). Unique on `(teamId, platform, accountId)`.

### 6.8 AdSpendDaily (`src/models/AdSpendDaily.ts`)

Daily campaign-level spend aggregation. One row per team/platform/account/campaign/date.

### 6.9 Subscription (`src/models/Subscription.ts`)

Paddle-only. Fields: `externalId`, `customerId`, `plan`, `interval (monthly|quarterly|semiannual|annual)`, `status (trialing|active|past_due|cancelled|paused)`, `cancelAtPeriodEnd`, `scheduledChangeAction/At`, `lastEventAt` (out-of-order guard), `dunningLastSentAt`, `dunningCount`.

### 6.10 Bundle (`src/models/Bundle.ts`)

`components[]` (productId, variantId, name, cogs, quantity). Computed: `totalCogs`, `grossMargin`, `netMarginEstimate`.

### 6.11 ProfitGoal (`src/models/ProfitGoal.ts`)

Monthly: `month ("YYYY-MM")`, `targetProfit`, `targetRevenue`, `targetMargin`. Alert config: `profitBelowPercent`, `marginBelowPercent`, `adSpendOverPercent`. Tracked: `currentProfit`, `currentRevenue`, `progressPercent`.

### 6.12 AlertRule (`src/models/AlertRule.ts`)

`metric`: `profit_margin | refund_rate | rto_rate | avg_order_profit`. `operator`: `below | above`. `threshold`, `windowDays (1–365)`. Cooldown via `lastTriggeredAt`.

### 6.13 Courier (`src/models/Courier.ts`)

`name`, `adapter ("generic")`, `apiKey` (AES-encrypted, never returned by API), `apiBaseUrl`. Unique on `(teamId, name)`.

### 6.14 Shipment (`src/models/Shipment.ts`)

`status`: `booked | picked_up | in_transit | out_for_delivery | delivered | failed_attempt | returned_rto | cancelled`. `cost`, `codAmount`, `codCollected`, `codSettledAt`. Links to `Order` for profit write-back. `source`: `csv | manual | api`.

### 6.15 Blocklist (`src/models/Blocklist.ts`)

`kind`: `phone | email | address`. `valueHash` (SHA-256 only — raw PII never stored). Unique on `(teamId, kind, valueHash)`.

### 6.16 RiskSignalWeight (`src/models/RiskSignalWeight.ts`)

Per-team, per-signal learned weights. Bounded `[0.5, 2.0]`. Updated only when merchant verdict contradicts score band.

### 6.17 NotifyRule (`src/models/NotifyRule.ts`)

`event`: `order_confirmed | order_shipped | out_for_delivery | delivered | cancelled | refund_issued | cod_tracking`. `channel`: `whatsapp | email | both`. Unique on `(teamId, event)`.

### 6.18 Notification (`src/models/Notification.ts`)

In-app notifications. `type`: 11 types (goal_behind, margin_drop, ad_spend_high, sync_error, sync_complete, trial_ending, subscription_cancelled, team_invite, refund_spike, cogs_missing, anomaly). Auto-expires after 90 days (MongoDB TTL).

### 6.19 AuditLog (`src/models/AuditLog.ts`)

29 action types: user events, team events, store events, product/order events, subscription events, goal/report/settings events, API key + webhook events. Auto-expires after 1 year (MongoDB TTL).

### 6.20 ApiKey (`src/models/ApiKey.ts`)

`keyHash` (SHA-256), `keyPrefix` (first 8 chars for display). Scopes: `read:orders | read:products | read:reports | write:cogs`. `lastUsedAt`, `usageCount`.

### 6.21 WebhookSubscription (`src/models/WebhookSubscription.ts`)

Outbound webhooks (Pro). `url`, `secret` (encrypted), `events[]`, `lastDeliveredAt`, `lastError`.

### 6.22 DailyRollup (`src/models/DailyRollup.ts`)

Pre-computed cache. One row per team per UTC day. Fields: `grossRevenue`, `netProfit`, `refunds`, `totalCogs`, `shippingCost`, `transactionFees`, `orderCount`, `cancelledOrderCount`. Unique on `(teamId, date)`.

### 6.23 CronRun (`src/models/CronRun.ts`)

Background job execution history. Idempotency keys, overlap protection, failed/partial run records.

### 6.24 WebhookEvent (`src/models/WebhookEvent.ts`)

Deduplication log for inbound Shopify webhooks. Keyed by `X-Shopify-Webhook-Id`.

### 6.25 Insight (`src/models/Insight.ts`)

Cached AI insights per team + period. `kind`: `periodic | waterfall | ask`. `items[]` (type, title, body). `inputs` (aggregated numbers — no PII). Auto-expires after 90 days (MongoDB TTL).

### 6.26 Blog (`src/models/Blog.ts`)

`title`, `slug` (auto-generated), `content`, `excerpt`, `status (draft|published|archived)`. Full SEO fields: `metaTitle`, `metaDescription`, `metaKeywords`, `ogTitle`, `ogDescription`, `ogImage`, `twitterCard`, `canonicalUrl`. `views`, `readTime` (auto-computed from word count at 200 wpm). `relatedPosts[]`. Text index on title + excerpt + content.

### 6.27 NotificationLog (`src/models/NotificationLog.ts`)

Audit + dedup for outbound WhatsApp/email. Keyed on `(team, order, event, channel)`. Masked recipients; no message bodies stored.

---

## 7. Core Profit Formulas

Implemented as pure functions in `src/lib/profit-engine.ts` — no DB calls, independently testable.

```
Net Revenue     = Gross Revenue − Refund Amount − Chargeback Amount
Gross Profit    = Net Revenue − Total COGS
Net Profit      = Net Revenue − Total COGS − Shipping Cost − Transaction Fees
                  − Ad Spend Allocated − Other Costs

Gross Margin %  = (Gross Profit / Net Revenue) × 100
Net Margin %    = (Net Profit  / Net Revenue) × 100

ROAS            = Revenue Attributed / Ad Spend
Break-even ROAS = (Revenue − Non-Ad Costs) / Ad Spend
MER             = Total Revenue / Total Ad Spend
```

**Money contract:**
- Gross revenue is tax-exclusive (Shopify `total_price − total_tax`)
- Discounts and shipping revenue are memos already inside gross revenue — never subtracted again
- Taxes are a pass-through — excluded from both revenue and profit
- All outputs rounded to 2dp; non-finite inputs coerce to 0
- FX conversion is explicit via `convertCurrency()`; unknown currencies throw rather than pass-through

**Extended profit fields** (`src/lib/profit-extended.ts`): packaging cost, COD fee, Shopify subscription share, RTO loss, expense allocation, tax-inclusive mode, stored FX rate at order time, COD collected vs pending.

---

## 8. Third-Party Integrations

### 8.1 Store Platform

| Integration | Purpose | Auth Method | Key Files |
|---|---|---|---|
| **Shopify** | Order sync, webhook ingestion, product/variant costs | OAuth offline tokens (AES-encrypted at rest) | `src/lib/shopify.ts`, `src/lib/shopify-graphql.ts` |

Shopify scopes: `read_orders, read_products, read_inventory, read_customers, read_fulfillments, read_shipping`

### 8.2 Ad Platforms

| Platform | Purpose | Auth | Notes |
|---|---|---|---|
| **Meta (Facebook/Instagram)** | Daily ad spend sync, UTM attribution, true ROAS | OAuth + token refresh | Proactive refresh + on-190 refresh; spend stored in account currency; rate-limit retries |
| **Google Ads** | Daily ad spend sync | OAuth | Developer token required |
| **TikTok** | Daily ad spend sync | OAuth | `src/lib/tiktok-token.ts` for token refresh |
| **Pinterest** | Daily ad spend sync | OAuth | |
| **Snapchat** | Daily ad spend sync | OAuth | |

All OAuth flows use one-time nonce CSRF protection (`src/lib/oauth-state.ts`).

### 8.3 Billing

| Integration | Purpose | Notes |
|---|---|---|
| **Paddle** | Subscription billing, checkout, customer portal | Sole gateway. 4 intervals: monthly, quarterly, semiannual, annual. HMAC-verified webhooks with replay protection (5-min timestamp window). Deduped by `event_id`. Ordering-guarded by `lastEventAt`. |

### 8.4 Email

| Integration | Purpose |
|---|---|
| **Resend** | Welcome email, password reset, team invite, profit goal alerts, dunning reminders, scheduled profit reports |

### 8.5 AI

| Integration | Purpose | Plan Gate |
|---|---|---|
| **OpenAI** (`gpt-4o-mini`) | 3 actionable profit insights comparing last 30d vs prior 30d | Growth: weekly; Pro: real-time. Never sends PII — only aggregated numbers. |

### 8.6 Messaging

| Integration | Purpose |
|---|---|
| **Meta WhatsApp Cloud API v21.0** | Order event notifications (confirmed, shipped, out-for-delivery, delivered, cancelled, refund, COD tracking) |

### 8.7 Observability & Infrastructure

| Integration | Purpose |
|---|---|
| **Sentry** | Error tracking (client + server + Edge) |
| **Cloudinary** | Blog image uploads and serving |
| **Upstash Redis** | Distributed rate limiting (optional; in-memory fallback) |
| **Google Analytics** | Marketing page analytics (`NEXT_PUBLIC_GA_MEASUREMENT_ID`) |
| **Google AdSense** | Marketing page ads (`NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`) |

---

## 9. Authentication & Authorization

### Authentication

- **Method:** NextAuth v5 with two providers:
  1. **Credentials** — email + bcrypt password. Rate-limited per-IP and per-email (10 req / 10 min). Account lockout after 5 failed attempts (15-min lockout). Email verification required before login.
  2. **Google OAuth** — via `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
- **Session:** JWT stored in an httpOnly, SameSite=Lax cookie. `teamId` and `teamRole` embedded in the token.
- **Edge middleware** — all routes except static files, public API endpoints, Shopify/TikTok OAuth callbacks, and billing webhooks are gated.
- **Token security:** Raw reset tokens and invite tokens are never stored — only SHA-256 hashes. Backfill migration handles legacy rows.

### Authorization — Four Team Roles

| Permission | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| `write:data` (create/update/delete business data) | ✓ | ✓ | ✓ | ✗ |
| `edit:cogs` (change COGS rules) | ✓ | ✓ | ✓ | ✗ |
| `manage:team` (invite/remove/change roles) | ✓ | ✓ | ✗ | ✗ |
| `manage:billing` (checkout, cancel, plan) | ✓ | ✗ | ✗ | ✗ |
| `manage:apikeys` (create/revoke API keys) | ✓ | ✓ | ✗ | ✗ |
| `view:audit` (read audit log) | ✓ | ✓ | ✗ | ✗ |

Role is re-read from DB on every mutating route — stale session tokens cannot escalate privileges.

### API Key Auth (v1)

Pro plan only. Keys are scoped (`read:orders`, `read:products`, `read:reports`, `write:cogs`). Validated via `src/lib/api-key-auth.ts`. SHA-256 hash stored; plaintext returned only once.

---

## 10. Billing & Subscription Plans

**Gateway:** Paddle (sole provider as of Phase 1)  
**Trial:** 14-day free trial, no credit card required  
**Intervals:** Monthly, Quarterly (−10%), Semiannual (−15%), Annual (−20%)

| Plan | Monthly Price | Orders/mo | Stores | Ad Platforms | AI Insights | Team Members | API Access | PDF Reports |
|---|---|---|---|---|---|---|---|---|
| **Free** | $0 | 50 | 1 | 0 | ✗ | 1 | ✗ | ✗ |
| **Starter** | $3 | 100 | 1 | 1 | ✗ | 2 | ✗ | ✗ |
| **Growth** | $9 | 1,000 | 2 | 3 | Weekly | 5 | ✗ | ✓ |
| **Pro** | $25 | Unlimited | Unlimited | Unlimited | Real-time | Unlimited | ✓ | ✓ |

**Gating:** `src/lib/entitlements.ts` enforces plan limits. `checkSubscription()` returns 402 for archived (trial-expired) accounts on every write route.

**Dunning:** `payment.failed` events trigger a cron job that sends payment-failure reminder emails with 24h cooldown, tracked by `dunningLastSentAt` + `dunningCount`.

---

## 11. Key Features by Category

### Analytics & Reporting
- Overview KPI dashboard with period-over-period comparison
- P&L income-statement report with CSV export
- True-profit analytics: full cost breakdown, daily series, winners/losers
- LTV + monthly cohort analysis
- Anomaly detection (z-score) with in-app notifications
- Time-series revenue forecasting (damped trend)
- 5 CSV report types + PDF (Pro)

### Product & COGS Management
- Per-product, per-variant COGS with landed cost breakdown (6 components)
- Full COGS edit history
- CogsRule backfill applies updated costs retroactively to past orders
- Product intelligence: fully-loaded profit ranking, break-even price, max discount headroom, movers

### Ad Spend & Attribution
- 5 ad platforms: Meta, Google, TikTok, Pinterest, Snapchat
- Daily spend sync with incremental window (lastSyncAt − 3 days for delayed reporting)
- Meta UTM attribution: matches orders to campaigns via parsed landing-site UTM
- Per-campaign true profit + break-even ROAS
- Attribution model toggle: first-click, last-click, linear
- FX conversion at query time (503 when FX unavailable and currencies differ)

### Fake-Order Detection (Risk Engine)
- 0–100 risk score per order; bands: low/medium/high/critical
- 13+ scoring signals: disposable email, gibberish names, velocity, blocklist, RTO history, value/quantity outliers, odd hours, billing/shipping mismatch, learned per-product/per-city RTO rates
- Auto-tag in Shopify + hold fulfillment for high/critical
- Merchant verdict feedback — learns signal weights per team [0.5, 2.0]
- Hashed tenant blocklist (SHA-256 only)
- Money-saved metric (prevented fake value); RTO loss reported separately

### Courier & Logistics
- Generic tracking adapter + CSV import
- Per-courier, per-city, per-region delivery metrics
- Best-courier ranking (20-shipment minimum, confidence levels)
- Switching profit impact estimation
- Stuck (>5d) + COD settlement (>7d) + high-RTO-area alerts
- Profit write-back: delivered → actual shipping cost; RTO → cost + packaging → recomputes netProfit

### Customer Analytics
- RFM segmentation: champions, loyal, new, at-risk, lost, regular
- Scored on relative quintiles within the store's own customers
- Customer table filtered by segment (top 100 by profit)

### Goals & Alerts
- Monthly profit target with color-coded progress bars
- Goal alert: email + Slack when below threshold
- Guardrail rules on 4 metrics with custom window and operator
- Alert cooldown: max once per rule per 24h

### Order Notifications (WhatsApp + Email)
- 7 order events: confirmed, shipped, out-for-delivery, delivered, cancelled, refund, COD tracking
- WhatsApp (Meta Cloud API) + Resend email
- COD tracking rule: special message with tracking ID + courier for COD orders
- Dedup: same stage never notifies twice even if both Shopify webhook and courier update fire
- No rule / no contact / no credentials → skipped silently, never a blast

### Simulator
- Entirely client-side (no API calls)
- 8 input sliders → profit/unit, total profit, ROI, break-even price, break-even units
- Real-time Recharts cost-breakdown bar chart

### Team & Access Control
- 4-role permission system (owner/admin/member/viewer)
- Email invitations with 48h expiry (hashed tokens)
- Viewer-only read-only dashboard
- Role-filtered navigation

### Settings & Operations
- Workspace settings (name, currency, timezone)
- API key management (owner + admin; SHA-256 hashed)
- 29-action audit log with 1-year TTL
- In-app notification bell + notification center
- Admin: background job monitor + manual run

### Blog & Marketing
- Full CMS with Tiptap rich text editor
- Full SEO metadata per post
- Auto-computed read time, slug, publishedAt
- Full-text search index

---

## 12. Environment Variables

All variables are defined in `.env.example` (`src/lib/env.ts` is the runtime source of truth — missing required vars cause a fail-fast at boot).

### Required in Production

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | NextAuth JWT signing secret (32+ random chars) |
| `ENCRYPTION_KEY` | AES-256 key for OAuth tokens + courier API keys at rest (32+ chars) |
| `NEXT_PUBLIC_SITE_URL` | Full canonical site URL |
| `PADDLE_API_KEY` | Paddle server-side API key |
| `PADDLE_WEBHOOK_SECRET` | Paddle webhook HMAC secret |
| `CRON_SECRET` | Bearer secret for `/api/cron/*` routes |
| `RESEND_API_KEY` | Resend transactional email API key |
| `EMAIL_FROM` | Sender address (e.g. `ProfitCalc <hello@example.com>`) |

### Paddle Billing (Price IDs)

`NEXT_PUBLIC_PADDLE_ENV`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` + 12 price IDs covering Starter/Growth/Pro × monthly/quarterly/semiannual/annual.

### Store Integration

| Variable | Purpose |
|---|---|
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | Shopify app OAuth credentials |

### Ad Platform OAuth

`META_APP_ID`, `META_APP_SECRET`, `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `SNAPCHAT_CLIENT_ID`, `SNAPCHAT_CLIENT_SECRET`

### Optional / Feature Flags

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Sign-in (NextAuth) |
| `OPENAI_API_KEY` | AI insights (Growth/Pro) |
| `OPENAI_MODEL` | Model override (default: `gpt-4o-mini`) |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | Blog image uploads |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Distributed rate limiting (fallback: in-memory) |
| `SENTRY_DSN` | Error tracking |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender phone number |
| `WHATSAPP_BUSINESS_ID` | WhatsApp Business account |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics |
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | Google AdSense |
| `API_RATE_LIMIT_MAX` | Max requests per window (default: 100) |
| `API_RATE_LIMIT_WINDOW_MS` | Rate limit window (default: 60000ms) |
| `USE_MOCK_ADS` / `AD_MOCK_MODE` | Dev/test mock ad data. **Refused in production.** |
| `LOG_LEVEL` | Log verbosity (`info` default) |
| `ENFORCE_CSRF` | CSRF enforcement toggle (default: `true`) |

---

## 13. Security Measures

| Area | Implementation |
|---|---|
| **Passwords** | bcrypt hashed; never stored plaintext |
| **OAuth tokens** | AES-256 encrypted at rest via `crypto-js`; decrypted server-side only |
| **API keys** | SHA-256 hashed; plaintext returned once; prefix stored for display |
| **Invite/reset tokens** | SHA-256 hashed; raw tokens never stored (migrations clean legacy rows) |
| **Blocklist PII** | SHA-256 hashes only; raw phone/email/address never written to DB |
| **Session** | HttpOnly, SameSite=Lax NextAuth cookies; `jose` JWT; role re-read from DB on mutations |
| **CSRF** | Same-origin session-cookie model; `ENFORCE_CSRF=true` env gate |
| **Rate limiting** | Sliding-window per-IP + per-email on auth routes; per-route limits on all API routes; atomic Lua on Redis |
| **OAuth CSRF** | One-time nonce in HttpOnly cookie, embedded in `state`, single-use on callback (`src/lib/oauth-state.ts`) |
| **Webhook signatures** | HMAC-SHA256 + `timingSafeEqual` on Shopify and Paddle webhooks; 5-min timestamp replay window on Paddle |
| **Webhook dedup** | `WebhookEvent` model keyed by `X-Shopify-Webhook-Id`; Paddle deduped by `event_id` |
| **SQL / NoSQL injection** | Mongoose ODM with typed schemas; never raw string interpolation in queries |
| **Input validation** | Zod on all API route inputs (query params, bodies, path params) |
| **Security headers** | CSP (no `unsafe-eval` in prod), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS (2-year), `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` |
| **Login throttling** | 10 req / 10 min per-IP + per-email on credential login; DB lockout after 5 fails (15 min) |
| **Email enumeration** | `forgot-password` and `verify-email/resend` return identical responses regardless of whether email exists |
| **Mock data in prod** | `USE_MOCK_ADS=true` / `AD_MOCK_MODE=true` refused at runtime when `NODE_ENV=production` |
| **Tenant isolation** | All data queries scoped by `teamId` from the signed session; client-supplied `teamId` ignored |
| **Audit trail** | 29 action types logged with userId, IP, timestamp; 1-year TTL |
| **Secret logger** | `src/lib/logger.ts` redacts known secret fields before writing structured JSON |
| **Sentry** | Error tracking on client, server, and Edge; `logger.error` forwards automatically |

---

## 14. Deployment Architecture

### Vercel (primary)

- **Output:** Next.js standalone build
- **Cron jobs:** 6 Vercel Cron jobs defined in `vercel.json`
- **Database:** MongoDB Atlas (recommended; continuous cloud backups)
- **Environment:** all vars from `.env.example` set in Vercel dashboard
- **Sentry:** source maps uploaded during build (when `SENTRY_ORG/PROJECT` set)

### Docker (self-hosted)

```
docker compose up --build -d
npx tsx scripts/ensure-indexes.ts  # once per deploy
curl localhost:3000/api/ready
```

Services: `app` (Node 20 slim, standalone output) + `mongo` (MongoDB 7, named volume). App healthcheck via `/api/health`. Mongo healthcheck via `mongosh ping`.

### Database Operations

- **Indexes:** `npx tsx scripts/ensure-indexes.ts` — run once per deploy. Creates all schema indexes including Phase 4/6/8 additions.
- **Migrations:** All scripts in `scripts/` are idempotent with `--dry-run` support.
  - `scripts/migrate-roles.ts` — role field migration
  - `scripts/migrate-reset-tokens.ts` — hash legacy raw reset tokens
  - `scripts/migrate-invite-tokens.ts` — hash legacy raw invite tokens
  - `scripts/backfill-email-verified.ts` — grandfather pre-existing users as verified
  - `scripts/migrate-shopify-only.ts` — archive legacy non-Shopify stores (one-time)
- **Backups:** Atlas continuous cloud backups + weekly snapshot export; or nightly `mongodump` (keep 30 days, test restores quarterly)

---

## 15. CI/CD Pipeline

`.github/workflows/ci.yml` — runs on every push to `main` and every PR:

1. **lint-typecheck-test** (ubuntu-latest, Node 20)
   - `npm ci`
   - `npm run lint` (ESLint 9)
   - `npx tsc --noEmit` (TypeScript strict)
   - `npm test` (Vitest — 413 tests across 25+ files)

2. **build** (needs: lint-typecheck-test)
   - `npm run build` (Next.js production build)

3. **e2e** (needs: build)
   - `npx playwright install --with-deps chromium`
   - `npx playwright test` (5 smoke tests: homepage, health/ready probes, OpenAPI spec, 404, cookie banner)
   - Upload `playwright-report/` artifact on failure

---

## 16. Notable Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **D1 — Stack** | Keep Next.js + MongoDB + Mongoose + Paddle | Stack was proven sound; rewriting would discard verified behavior |
| **D2 — Store platform** | Shopify-only; CSV stays for backfill | CSV is the "import data" onboarding step, not a competing platform |
| **D3 — Legacy data** | Archive, don't delete | Hard-deleting order history would silently rewrite merchants' past P&L reports |
| **D4 — Shopify sync** | REST kept for orders; GraphQL added for variant costs | REST sync is battle-tested; GraphQL only added where REST is weaker (product costs) |
| **D5 — Profit engine** | Extended with new fields, core formula unchanged | Changing the core in place would break existing reports and tests |
| **D6 — New logic** | Pure library first, thin server bridge second | Makes scoring/ranking testable without a database; webhook failures cannot block ingestion |
| **D7 — Mock ads** | Dev/test only; refused in production | Mock spend in production would silently fake the P&L |
| **D8 — Billing** | Paddle stays | Standalone SaaS (not a Shopify embedded app); switching mid-rebuild would be high risk |
| **D10 — Risk scoring** | `after()` — scoring never blocks webhook response | A slow score must never block order ingestion |
| **D11 — Meta attribution** | UTM-only, no cross-device or probabilistic | Only data Shopify actually provides; unattributed spend reported separately, never spread |
| **D12 — Couriers** | Generic adapter only | Merchant's courier list was not supplied; CSV is the working fallback |
| **D13 — Roles** | Keep owner/admin/member/viewer | Renaming to staff/accountant would break existing teams |
| **D14 — Rollups** | Cache only; live orders are source of truth | Rollups pre-compute for perf; late refunds correct history on next daily run |
| **D15 — WhatsApp** | No rule/no contact → skip, never blast | Safety-first; message bodies not stored in the log (masked recipients only) |

---

## 17. Test Coverage

| Category | Coverage |
|---|---|
| **Total unit/integration tests** | 413 passing, 0 failing (Vitest) |
| **Profit engine** | Full formula coverage including zero-divisor money, non-finite inputs, 2dp rounding |
| **Risk engine** | Scoring signals, weight learning, bounds |
| **Courier module** | Metrics, ranking, CSV import, profit write-back |
| **RFM segmentation** | Quintile scoring, segment precedence |
| **Product intelligence** | Fully-loaded profit, break-even, movers |
| **Alert rules** | Windowed metric evaluation, severity bands, no-data safety |
| **OAuth state** | Round-trip, tamper detection, missing cookie, replay/single-use, uniqueness |
| **Shopify sync** | Order upsert, multi-store isolation, webhook dedup |
| **Entitlements** | Plan limits, 402 gating |
| **Permissions** | Role → permission mapping, last-owner guard |
| **Password policy** | HIBP check (k-anonymity), lockout thresholds |
| **E2E smoke** | Homepage title + skip link, health/ready probes, OpenAPI spec, 404, cookie banner |

---

## 18. Known Gaps & Pending Items

| Item | Status |
|---|---|
| **Named courier adapters** | Generic adapter only. Merchant must supply courier list (TCS, Leopard, M&P, DHL, etc.) for named adapters. |
| **Meta ad-set/ad-level breakdown** | Sync is campaign-level only. Ad set/ad breakdown needs a new `AdSpendDaily` upsert key + migration. |
| **Shopify dev-store round-trip** | Not verified in the build environment (no credentials). Covered by integration tests with in-memory Mongo. |
| **WhatsApp template approval** | Free-form text requires an open customer-service window. Production needs approved Meta message templates. |
| **Playwright browser tests (2 of 5)** | Homepage + cookie banner tests require `npx playwright install chromium` on the target machine. 3 API-level tests pass. |
| **`npm audit`** | Could not run in the build VM. Run on a normal network before release. |

---

*End of report. All findings are grounded in files read directly from the workspace.*
