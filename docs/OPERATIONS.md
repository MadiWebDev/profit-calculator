# Operations runbook — GetProfitCalc

## Deploy checklist (Vercel)

1. Set every variable from `.env.example` (see "Required" below). The app
   fail-fasts at boot when a required var is missing (`src/lib/env.ts`).
2. Point Paddle sandbox/live webhooks at `https://<domain>/api/billing/webhook`.
3. Add Vercel Cron jobs (or import `vercel.json` — 6 jobs defined).
4. Set `CRON_SECRET` and configure each cron to send
   `Authorization: Bearer <CRON_SECRET>`.
5. Verify `/api/health` → 200 and `/api/ready` → 200 after deploy.

## Deploy checklist (Docker)

```bash
cp .env.example .env   # fill in real values
docker compose up --build -d
npx tsx scripts/ensure-indexes.ts   # once per deploy
curl localhost:3000/api/ready
```

## Required env vars

`MONGODB_URI`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_SITE_URL`,
`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`,
`EMAIL_FROM`. Everything else degrades gracefully (documented in `.env.example`).

## Migrations

`scripts/` holds idempotent migrations, each with `--dry-run` and count
logging. Run in order after deploy:

```bash
npx tsx scripts/migrate-roles.ts
npx tsx scripts/migrate-reset-tokens.ts
npx tsx scripts/migrate-invite-tokens.ts
npx tsx scripts/backfill-email-verified.ts
npx tsx scripts/ensure-indexes.ts   # index pass (safe to re-run anytime)
```

## Backups (MongoDB)

- **Atlas**: enable continuous cloud backups (recommended) + weekly snapshot export.
- **Self-hosted / compose**: nightly `mongodump`:
  ```bash
  docker exec <mongo-container> mongodump --archive=/backup/$(date +%F).archive
  ```
  Keep 30 days, store off-site. Test restores quarterly with `mongorestore`.

## Cron jobs

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/sync-stores` | hourly | order sync for active stores |
| `/api/cron/refresh-ad-spend` | every 6h | ad spend refresh |
| `/api/cron/goal-alerts` | daily 08:00 | goal progress + alerts |
| `/api/cron/dunning` | daily 09:00 | payment-failure reminders |
| `/api/cron/anomaly-scan` | daily 07:00 | anomaly detection + notifications |
| `/api/cron/backfill-cogs` | weekly Sun 06:00 | COGS rule backfill |

Manual run (admin): Dashboard → Settings → Jobs, or
`POST /api/admin/jobs/run` with `{ "job": "<name>" }`.

## Observability

- **Logs**: JSON lines in production (`src/lib/logger.ts`), secrets redacted.
- **Sentry**: set `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN` for browser).
  `logger.error` forwards to Sentry automatically; no code changes needed.
- **Probes**: `/api/health` (liveness), `/api/ready` (MongoDB + Redis).

## Dependency updates

Dependabot runs weekly (`.github/dependabot.yml`) for npm and GitHub
Actions. CI (`.github/workflows/ci.yml`) runs lint → typecheck → unit
tests → production build → Playwright smoke tests on every PR.
