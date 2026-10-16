# Baseline Report — GetProfitCalc takeover

Recorded 2026-10-16 before Phase 1 work began. All commands run from the repo root.

## Environment

- Next.js 16.3.3 (App Router, Turbopack), React 19.2.8, TypeScript 5.x, Tailwind v4
- MongoDB via Mongoose 9.9.4, NextAuth v5 beta (credentials), Paddle Billing, Resend, OpenAI
- 282 TS/TSX files, 58 API route handlers, 16 Mongoose models

## Command results (pre-change)

| Check | Result |
|---|---|
| `npm install` | ✅ clean |
| `npm run lint` | ❌ 117 errors, 77 warnings (dominated by `@typescript-eslint/no-explicit-any` ×62 and `@typescript-eslint/no-unused-vars` ×60) |
| `npx tsc --noEmit` | ✅ clean (exit 0) |
| `npm run build` | ❌ fails at "Collecting page data" — `src/lib/db.ts` throws at import time when `MONGODB_URI` is unset in the build env (`/api/ad-accounts/meta/auth`) |
| `npm test` | ❌ no test runner configured (added in this phase) |

## Key structural findings (confirmed in source)

- F1/F2: `shopify/callback` fires an unauthenticated server-side `fetch()` to `/api/stores/shopify/sync`, which the middleware would redirect to login; the sync route trusts body-supplied `{storeId, teamId}` with no session.
- F3: `PLAN_LIMITS` in `src/lib/plans.ts` is never enforced anywhere.
- F4: `Team.members[].role` enum is `["owner"]` only; invites always create `role: "owner"` and store the raw invite token in the DB (also returned in the JSON response).
- F5: only Meta + TikTok ad-account routes exist; Google/Pinterest/Snapchat have env vars + UI colours but no routes.
- F6: no `vercel.json`, no cron routes — all sync/refresh/alerts are click-driven.
- F7: Shopify API version `2024-01` hard-coded in callback + sync; no GDPR webhooks.
- F8: Zod used in 3 files; most routes use `await req.json()` fields directly.
- F9: no tests, no CI.
- F10: Paddle webhook is upsert-idempotent only — no processed-event log, no out-of-order guard.
- F11: `ai-insights` has no cache, no per-plan cap, no cadence enforcement.
- F12: profit engine sums in mixed currencies with "no conversion here" comment; refunds don't reverse COGS.
- F13: `Google` provider imported in `src/lib/auth.ts` but never registered (lint: unused import) — Google sign-in advertised but not wired.
- F14: rate limiter exists but is unused on auth/import/billing/keys/v1; Redis path does INCR then conditional EXPIRE as two calls (race).
- F15: `lib/csrf.ts` used only by Shopify callback + onboarding.
- F16: 141 `console.*` calls; no `src/lib/logger.ts`; no Dockerfile; no `/api/health`.
- F17: `tsconfig.tsbuildinfo` present on disk but NOT tracked in git (already covered by `*.tsbuildinfo` in `.gitignore`); `@types/jspdf` is a deprecated stub.
- F18: `.env.example` out of sync (code reads `ENFORCE_CSRF`, `UPSTASH_*`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `CRON_SECRET` — example lacks them; example lists Google Ads/Pinterest vars the code never reads).

## Changes made in Phase 0 (this phase)

- Added `vitest` + `@vitest/coverage-v8` + `mongodb-memory-server` + `fast-check` (devDependencies, `--legacy-peer-deps` for the `@types/node` peer conflict) and `test` / `test:watch` / `test:coverage` scripts. Smoke test passes.
- Added `src/lib/logger.ts` — structured logger, JSON in prod, redacts token/secret/password/authorization patterns.
- Rewrote `src/lib/env.ts` — Zod-validated, fails fast at boot listing ALL missing required vars; warns on recommended ones.
- Added `src/instrumentation.ts` — runs `validateEnv()` at server boot.
- Fixed `src/lib/db.ts` — no longer throws at import time; throws lazily inside `connectDB()` (fixes `next build` without `MONGODB_URI`).
- `vitest.config.ts` added with `@/` alias and coverage thresholds.

## Remaining baseline debt (tracked in later phases)

- 117 lint errors (mostly `no-explicit-any`) — to be driven to zero file-by-file as phases touch them, plus a final cleanup pass.
- No CI yet (Phase 11).
