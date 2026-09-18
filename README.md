<div align="center">

<h1>
  <img src="public/file.svg" width="32" style="vertical-align:middle" />
  GetProfitCalc
</h1>

<p><strong>A full-stack SaaS profit analytics platform for e-commerce merchants.</strong><br/>
Track true net profit across orders, products, and ad spend — with AI-powered insights.</p>

<p>
  <img src="https://img.shields.io/badge/Next.js-16.3-black?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47a248?logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?logo=openai&logoColor=white" />
</p>

</div>

---

## Overview

GetProfitCalc helps e-commerce store owners understand whether they're actually making money. Most merchants know their revenue — few know their net profit after COGS, shipping, platform fees, ad spend, refunds, and chargebacks are accounted for. GetProfitCalc closes that gap.

Merchants connect their Shopify or Etsy store (or import via CSV), set product COGS, and get a full income-statement-style breakdown in real time. Ad spend from Meta, Google, TikTok, Pinterest, and Snapchat is synced and attributed at the order level so ROAS is calculated against true profit, not just revenue.

---

## Features

### Analytics Dashboard
- **Overview** — KPI cards for revenue, net profit, margin, orders, and ROAS. Period-over-period comparison with a flexible date range picker (Today, 7d, 30d, 90d, YTD, custom).
- **P&L Report** — Income-statement layout: Gross Revenue → Discounts → Net Revenue → COGS → Gross Profit → Operating Expenses → Net Profit. CSV export included.
- **Orders** — Full order table with per-order cost breakdown (COGS, shipping, fees, ad spend allocated, refunds, net profit, margin).
- **Products** — Per-SKU margin stats with an inline COGS editor supporting landed cost breakdown: supplier cost, inbound shipping, import duties, packaging, prep, and other costs.
- **Ad Spend** — Multi-platform ROAS table with attribution model toggle (first-click, last-click, linear) and campaign-level drill-down.
- **LTV & Cohort** — Customer lifetime value by acquisition-month cohort, repeat purchase rate, average order value per cohort.
- **Bundles** — Build composite products from existing SKUs; auto-calculates bundle COGS and estimates gross/net margin.
- **What-If Simulator** — Interactive sliders for selling price, COGS, shipping, transaction fees, platform fees, ad spend per unit, quantity, and refund rate. Outputs profit per unit, total profit, ROI, break-even price, and break-even units. Recharts cost-breakdown bar chart updates in real time, entirely in-browser with no API calls.
- **Profit Goals** — Set monthly profit targets. Progress bars are color-coded (green ≥80%, yellow ≥50%, red <50%). Configurable email and Slack alerts fire when progress falls below a threshold.
- **Reports & Export** — Download five report types as CSV (Profit Summary, Order Detail, Product Margins, Ad Spend ROI, Tax Estimate) with a date-range picker. PDF export on Pro.

### AI Insights
- Powered by OpenAI `gpt-4o-mini`. Compares the last 30 days against the prior 30 days and returns three structured, actionable insights with specific numbers from your own data.
- Gated by plan: Growth gets weekly insights, Pro gets real-time. Free/Starter see an upgrade prompt — no API call is made.

### Team & Access Control
Four roles with granular permissions:

| Role | Write Data | Manage Team | Manage Billing | Edit COGS |
|------|:----------:|:-----------:|:--------------:|:---------:|
| Owner | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✗ | ✓ |
| Member | ✓ | ✗ | ✗ | ✓ |
| Viewer | ✗ | ✗ | ✗ | ✗ |

Viewer-role members get a dedicated read-only dashboard. Navigation items are filtered by role (Team management is admin+; API Keys and Audit Log are owner-only).

### Settings & Security
- **API Keys** — Create scoped keys (owner only). The full key is shown once; only a SHA-256 hash is stored. Usage count and last-used timestamp are tracked.
- **Audit Log** — Timeline of all 19 action types across the workspace (store connections, COGS edits, billing events, team changes, etc.). Auto-expires after 1 year via MongoDB TTL index.
- **Notifications** — In-app notification bell + email/Slack alerts for goal progress.
- **Workspace Settings** — Name, currency, timezone, notification preferences, subscription management.

### Billing
Pluggable payment gateway layer — switch between **Dodo Payments** (default) and **Paddle** with one env var:

| Plan | Monthly | Annual | Orders/mo | Stores | Ad Platforms | AI Insights | Team Members | API Access |
|------|--------:|-------:|:---------:|:------:|:------------:|:-----------:|:------------:|:----------:|
| Free | $0 | $0 | 50 | 1 | — | ✗ | 1 | ✗ |
| Starter | $2 | $1.60/mo | 100 | 1 | 1 | ✗ | 2 | ✗ |
| Growth | $9 | $7.20/mo | 1,000 | 2 | 3 | Weekly | 5 | ✗ |
| Pro | $25 | $20/mo | Unlimited | Unlimited | Unlimited | Real-time | Unlimited | ✓ |

All new accounts start with a **14-day free trial**. No credit card required.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.3 — App Router, Server Components, Edge Middleware |
| Language | TypeScript 5 |
| Frontend | React 19, Tailwind CSS v4, Radix UI, Recharts, Framer Motion |
| Icons | `lucide-react` |
| Forms | `react-hook-form` + `zod` |
| Database | MongoDB via Mongoose 9 |
| Auth | NextAuth v5 (Credentials + Google OAuth), `jose` for JWT |
| Payments | Dodo Payments / Paddle (pluggable) |
| Email | Resend |
| AI | OpenAI SDK (`gpt-4o-mini`) |
| Encryption | AES-256 via `crypto-js` (OAuth tokens at rest) |
| Passwords | `bcryptjs` |
| CSV | PapaParse |
| Rate Limiting | In-memory (single instance) or Upstash Redis (distributed) |
| PWA | Service worker + Web App Manifest |

---

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx            # Auth guard, RoleProvider, sidebar
│   │   └── dashboard/
│   │       ├── page.tsx + OverviewClient.tsx
│   │       ├── orders/
│   │       ├── products/         # CogsEditor.tsx
│   │       ├── pnl/
│   │       ├── ad-spend/
│   │       ├── ltv/
│   │       ├── bundles/
│   │       ├── simulator/
│   │       ├── goals/
│   │       ├── reports/
│   │       ├── team/
│   │       ├── viewer/           # Read-only for Viewer role
│   │       └── settings/
│   │           ├── api-keys/
│   │           └── audit-log/
│   ├── auth/                     # Login, register, forgot/reset password, accept-invite
│   ├── onboarding/               # Post-registration store connection
│   ├── api/
│   │   ├── auth/                 # [...nextauth], register, forgot/reset-password
│   │   ├── billing/              # checkout, cancel, webhook
│   │   ├── stores/               # CRUD + Shopify & Etsy OAuth
│   │   ├── orders/               # CSV import
│   │   ├── products/ + cogs/     # COGS management
│   │   ├── goals/
│   │   ├── bundles/
│   │   ├── team/                 # invite, accept-invite, members
│   │   ├── keys/                 # API key management
│   │   ├── reports/              # CSV/PDF report generation
│   │   ├── ai-insights/          # OpenAI analysis
│   │   ├── notifications/
│   │   ├── user/
│   │   └── v1/                   # Public REST API (Pro plan)
│   │       ├── orders/
│   │       └── summary/
│   └── (marketing)/              # Homepage, pricing, blog, docs, calculators
├── components/
│   ├── dashboard/                # Sidebar, Topbar, StatCard, RoleContext, RoleGate, NotificationBell
│   └── ui/                       # shadcn-style component library
├── lib/
│   ├── profit-engine.ts          # Core calculation engine (pure functions)
│   ├── plans.ts                  # Subscription tiers and feature limits
│   ├── auth.ts / auth.config.ts  # NextAuth configuration
│   ├── billing.ts                # Dodo/Paddle abstraction layer
│   ├── db.ts                     # MongoDB connection
│   ├── email.ts                  # Resend transactional emails
│   ├── encryption.ts             # AES-256 helpers
│   ├── audit.ts                  # Audit log writer
│   ├── api-key-auth.ts           # v1 API key validation
│   ├── rate-limit.ts             # Sliding-window rate limiter
│   └── csrf.ts                   # CSRF protection
└── models/                       # Mongoose schemas
    ├── User.ts
    ├── Team.ts
    ├── Store.ts
    ├── Order.ts
    ├── Product.ts
    ├── CogsRule.ts
    ├── AdAccount.ts
    ├── AdSpendDaily.ts
    ├── Bundle.ts
    ├── ProfitGoal.ts
    ├── Subscription.ts
    ├── ApiKey.ts
    ├── AuditLog.ts
    └── Notification.ts
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A MongoDB database (local or [MongoDB Atlas](https://www.mongodb.com/atlas))
- A [Resend](https://resend.com) account for transactional email
- Either a [Dodo Payments](https://dodopayments.com) or [Paddle](https://paddle.com) account for billing

### 1. Clone and install

```bash
git clone https://github.com/your-username/profit.git
cd profit
npm install
```

### 2. Configure environment variables

Copy the example below to `.env.local` and fill in your values:

```env
# ── Site ─────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ── NextAuth v5 ───────────────────────────────────────────────────────────────
AUTH_SECRET=                          # openssl rand -base64 32
AUTH_URL=http://localhost:3000

# Google OAuth (optional)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# ── Database ──────────────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/getprofitcalc

# ── Encryption (AES-256 for OAuth tokens at rest) ────────────────────────────
ENCRYPTION_KEY=                       # 32-character hex string

# ── Billing ───────────────────────────────────────────────────────────────────
PAYMENT_GATEWAY=dodo                  # "dodo" (default) or "paddle"

# Dodo Payments
DODO_API_KEY=
DODO_WEBHOOK_SECRET=
NEXT_PUBLIC_DODO_STARTER_PRICE_ID=
NEXT_PUBLIC_DODO_STARTER_ANNUAL_PRICE_ID=
NEXT_PUBLIC_DODO_GROWTH_PRICE_ID=
NEXT_PUBLIC_DODO_GROWTH_ANNUAL_PRICE_ID=
NEXT_PUBLIC_DODO_PRO_PRICE_ID=
NEXT_PUBLIC_DODO_PRO_ANNUAL_PRICE_ID=

# Paddle (if PAYMENT_GATEWAY=paddle)
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
NEXT_PUBLIC_PADDLE_STARTER_PRICE_ID=
NEXT_PUBLIC_PADDLE_GROWTH_PRICE_ID=
NEXT_PUBLIC_PADDLE_PRO_PRICE_ID=

# ── Email (Resend) ─────────────────────────────────────────────────────────────
RESEND_API_KEY=
EMAIL_FROM=GetProfitCalc <hello@yourdomain.com>

# ── AI (OpenAI) ───────────────────────────────────────────────────────────────
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini              # or gpt-4o, gpt-3.5-turbo

# ── E-commerce Integrations ───────────────────────────────────────────────────
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
ETSY_CLIENT_ID=
ETSY_CLIENT_SECRET=
ETSY_REDIRECT_URI=http://localhost:3000/api/stores/etsy/callback

# ── Ad Platform Integrations ──────────────────────────────────────────────────
META_APP_ID=
META_APP_SECRET=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=

# ── Analytics & Ads ───────────────────────────────────────────────────────────
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=

# ── Rate Limiting ─────────────────────────────────────────────────────────────
API_RATE_LIMIT_MAX=100                # requests per window
API_RATE_LIMIT_WINDOW_MS=60000        # window size in ms

# Upstash Redis for distributed rate limiting (optional)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for production

```bash
npm run build
npm start
```

---

## Core Profit Formula

The profit engine (`src/lib/profit-engine.ts`) is a set of pure functions with no database access, making them independently testable:

```
Net Revenue    = Gross Revenue − Discounts − Refunds − Chargebacks
Gross Profit   = Net Revenue − COGS
Net Profit     = Net Revenue − COGS − Shipping Cost − Transaction Fees − Ad Spend Allocated

Gross Margin % = (Gross Profit / Net Revenue) × 100
Net Margin %   = (Net Profit  / Net Revenue) × 100
```

Note: Taxes collected are treated as a pass-through (not a cost to the merchant) and are excluded from the profit calculation.

---

## API

### Authenticated Dashboard API

All dashboard API routes require a valid NextAuth session. Key endpoints:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/register` | Create account + workspace, send welcome email |
| `POST` | `/api/auth/forgot-password` | Generate password reset link (1-hour expiry) |
| `POST` | `/api/auth/reset-password` | Validate token and update password |
| `GET` | `/api/stores` | List connected stores (tokens excluded) |
| `POST` | `/api/stores` | Connect a store (tokens AES-256 encrypted at rest) |
| `POST` | `/api/stores/shopify/sync` | Pull orders from Shopify into the database |
| `POST` | `/api/orders/import` | Import orders from a CSV file (PapaParse) |
| `GET` | `/api/reports` | Generate CSV/PDF report (`?type=&from=&to=`) |
| `POST` | `/api/ai-insights` | Get three GPT-4o-mini profit insights (Growth/Pro) |
| `POST` | `/api/billing/checkout` | Create Dodo/Paddle checkout session |
| `POST` | `/api/billing/cancel` | Cancel active subscription |
| `POST` | `/api/billing/webhook` | HMAC-verified billing event handler |
| `POST` | `/api/team/invite` | Invite a team member by email |
| `GET`/`POST`/`DELETE` | `/api/keys` | Manage scoped API keys (owner only) |

### Public REST API (Pro plan)

Authenticate with a `Bearer <api-key>` header. Keys are created in Settings → API Keys.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/orders` | Paginated order list |
| `GET` | `/api/v1/summary` | Profit summary for a date range |

---

## Billing Webhook Setup

GetProfitCalc verifies webhook signatures to prevent replay attacks (timestamps older than 5 minutes are rejected).

**Dodo Payments**: Point your webhook to `https://yourdomain.com/api/billing/webhook`. Set `DODO_WEBHOOK_SECRET` to your webhook secret. The app listens for `subscription.created`, `subscription.activated`, `subscription.cancelled`, and `payment.failed` events.

**Paddle**: Same URL. Set `PADDLE_WEBHOOK_SECRET`. Uses `ts`/`h1` header format.

---

## Security

- **Passwords** — bcrypt hashed (never stored in plain text).
- **OAuth tokens** — AES-256 encrypted at rest before writing to MongoDB. Decrypted only on the server when needed for API calls.
- **API keys** — SHA-256 hashed on creation. The plaintext key is returned only once; only the hash and a short prefix are stored.
- **CSRF** — CSRF tokens required on all mutating requests.
- **Rate limiting** — Sliding-window rate limiter on all API routes (100 req/min by default). Distributed mode via Upstash Redis.
- **Webhook verification** — HMAC-SHA256 with replay attack prevention on all billing webhooks.
- **Session isolation** — All data queries are scoped to `teamId` from the authenticated session. No cross-tenant data leakage by design.
- **Audit log** — Every sensitive action (data mutations, billing events, team changes) is recorded with userId, timestamp, resource type, and description.

---

## Email Notifications

Powered by [Resend](https://resend.com). Four transactional emails are sent:

| Trigger | Email |
|---------|-------|
| New registration | Welcome + trial start confirmation |
| Goal below threshold | Profit alert with current vs. target numbers |
| Team invite | Invitation with 48-hour accept link |
| Password reset | Secure reset link (1-hour expiry) |

Configure your sending domain in the Resend dashboard and set `EMAIL_FROM` accordingly.

---

## Scripts

```bash
npm run dev       # Start development server (Next.js)
npm run build     # Production build
npm start         # Start production server
npm run lint      # ESLint
```

---

## License

This is a private project. All rights reserved.

---

<div align="center">
  Built with Next.js · MongoDB · OpenAI · Dodo Payments
</div>
