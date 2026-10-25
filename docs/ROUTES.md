# API Route Matrix — GetProfitCalc (89 routes)

Auth legend: **S** = session (`requireAuth`, team-scoped) · **K** = API key
(`requireV1Access`, scope-checked) · **C** = cron bearer (`CRON_SECRET`) ·
**W** = webhook signature (Paddle/HMAC) · **P** = public · **A** = admin
(platform super-admin). Every S/K route uses strict Zod validation and the
`{ error, code }` envelope.

## Store integrations (S unless noted)

| Route | Methods | Notes |
|---|---|---|
| `/api/stores` | GET, POST | list / connect |
| `/api/stores/[storeId]` | GET, PATCH, DELETE | |
| `/api/stores/[storeId]/sync` | POST | manual order sync |
| `/api/stores/shopify/{auth,callback,sync}` | GET | OAuth + sync |
| `/api/webhooks/shopify/[topic]` | POST | W: HMAC-verified topic fan-in, deduped by webhook id; topics: GDPR + app/uninstalled + orders + refunds + fulfillments + products |

## Ad platforms (S unless noted)

| Route | Notes |
|---|---|
| `/api/ad-accounts` | list |
| `/api/ad-accounts/[id]` | GET, DELETE (revoke + clear) |
| `/api/ad-accounts/{meta,tiktok,google,pinterest,snapchat}/{auth,callback}` | OAuth with state-nonce CSRF; callback triggers initial sync via `after()` |
| `/api/ad-accounts/{meta,tiktok}/sync` | legacy per-platform manual sync |
| `/api/ad-accounts/sync` | POST: generic sync for any platform |
| `/api/ad-accounts/meta/{deauthorize,data-deletion}` | Meta compliance webhooks (W) |

## Billing — Paddle (S unless noted)

| Route | Notes |
|---|---|
| `/api/billing/checkout` | create transaction |
| `/api/billing/portal` | customer portal URL |
| `/api/billing/cancel` | cancel subscription |
| `/api/billing/webhook` | POST, W: signature-verified, dedup by event_id, ordering guard, dunning |

## Analytics (S)

| Route | Notes |
|---|---|
| `/api/analytics/anomalies` | z-score detection (metric, days) |
| `/api/analytics/forecast` | damped-trend forecast (days, horizon) |
| `/api/analytics/cohorts` | monthly customer cohorts |
| `/api/ai-insights` | POST: AI v2, daily-cached |
| `/api/fx/rates` | cached FX spot rates |
| `/api/reports` | CSV export |

## Public API v1 (K, scoped)

| Route | Scope |
|---|---|
| `/api/v1/summary` | `read:reports` |
| `/api/v1/orders` | `read:orders` |
| `/api/v1/cogs` | `read:products` / `write:cogs` |
| `/api/docs/openapi` | P: OpenAPI 3.1 spec |

## Webhooks — outbound (S, Pro `api.access`)

| Route | Notes |
|---|---|
| `/api/webhooks` | GET, POST (secret returned once) |
| `/api/webhooks/[id]` | DELETE |

## Cron (C) & admin (A)

`/api/cron/{sync-stores,refresh-ad-spend,goal-alerts,dunning,anomaly-scan,backfill-cogs}` ·
`/api/admin/{jobs,jobs/run,users,blogs,blogs/[id],blogs/categories,blogs/tags}`

## Platform (P unless noted)

`/api/health` · `/api/ready` · `/api/auth/[...nextauth]` ·
`/api/auth/{register,forgot-password,reset-password,verify-email,verify-email/resend}` ·
`/api/blogs, /api/blogs/[slug], /api/blogs/{categories,tags}` ·
`/api/orders, /api/orders/[id], /api/orders/import` (S) ·
`/api/products, /api/products/[id]` (S) · `/api/bundles` (S) ·
`/api/cogs` (S) · `/api/goals` (S) · `/api/fx/rates` (S) ·
`/api/notifications, /api/notifications/slack-test` (S) ·
`/api/settings/notifications` (S) · `/api/stores` (S) ·
`/api/team, /api/team/{invite,members,accept-invite}` (S) ·
`/api/trial/status` (S) · `/api/usage` (S) · `/api/user` (S) ·
`/api/keys, /api/keys/rotate` (S, Pro) · `/api/upload/cloudinary` (S)
