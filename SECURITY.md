# Security Policy — GetProfitCalc

## Reporting a vulnerability

Email **security@getprofitcalc.com** with a description, steps to reproduce,
and the impact you see. We aim to acknowledge within 48 hours and ship a fix
or mitigation within 14 days for high-severity issues. Please do not open
public issues for security reports.

## Authentication

- **NextAuth v5** with JWT sessions. Credentials provider uses bcrypt (cost 12).
- **Email verification is required** for credential login. Registration issues
  a single-use 24h verification token (SHA-256 hash stored, raw token emailed).
  Google OAuth users are verified at creation.
- **Breach screening**: new passwords are checked against HIBP Pwned Passwords
  (k-anonymity, fail-open) plus a local policy (≥10 chars, letter + number/symbol).
- **Brute-force protection** (defense in depth):
  - Per-IP and per-email rate limits on `POST /api/auth/callback/credentials`
    (10 req / 10 min each, Redis-backed when configured).
  - DB-backed lockout: 5 consecutive failures → 15-minute lockout.
- **Session invalidation on password change** — JWTs issued before
  `passwordChangedAt` are rejected (checked at most every 5 min per session).
- Password-reset and invite tokens are single-use, time-boxed, and stored
  **hashed** — raw tokens never touch the database.

## Authorization

- Team roles: `owner` / `admin` / `member` / `viewer`. Every mutating API route
  goes through `requireAuth()` which enforces the session, the team's
  subscription state, and a granular permission
  (`write:data`, `edit:cogs`, `manage:team`, `manage:billing`,
  `manage:apikeys`, `view:audit`).
- Every DB query is scoped by `teamId` from the **session**, never from client
  input. ObjectIds are validated before use.
- Public API v1 (`/api/v1/*`) uses per-key auth: keys are stored as SHA-256
  hashes, carry least-privilege scopes, support expiry, and are rate-limited
  per key (401 bad key / 403 missing scope / 429 throttled).

## Input validation & abuse protection

- All API input is validated with strict Zod schemas (`.strict()`, coerced
  numbers with min/max caps, whitelisted enums/sort fields).
- Rate limiting on every route (presets: `auth`, `strict`, `standard`,
  `lenient`). Redis (Upstash) path is a single atomic Lua `EVAL`
  (INCR + conditional EXPIRE + TTL); in-process map is the fallback.
- Same-origin CSRF check on cookie-authenticated mutations.
- OAuth `state` uses a one-time HttpOnly-cookie nonce (login-CSRF protection);

## Secrets & data protection

- OAuth tokens and store credentials are **AES-256-GCM encrypted** at rest
  (`ENCRYPTION_KEY` env, validated at boot). Disconnecting a store/ad account
  revokes the provider token (Meta, TikTok) and wipes local credentials.
- `src/lib/env.ts` validates required env vars with Zod at startup (fail-fast
  in production; safe defaults only for local dev).
- Structured logger redacts `token|secret|password|authorization|api_key`
  fields; raw `console.*` output of request bodies is prohibited.
- Security headers on all routes: strict CSP (incl. `frame-ancestors 'none'`),
  HSTS (prod), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP `same-origin`.

## Webhooks

- Shopify: HMAC-SHA256 over the **raw body** verified with timing-safe compare.
- Paddle: signature verification on the raw body (see Phase 8 hardening).
- Meta deauthorize/data-deletion: `signed_request` HMAC verified.
- All webhook/cron handlers are idempotent; cron routes require a bearer
  secret compared with `crypto.timingSafeEqual`.

## Dependency hygiene

- Run `npm audit` before each release and fix high/critical findings.
  (`npm install` in this repo currently needs `--legacy-peer-deps` because of
  a vitest/vite `@types/node` peer conflict — see package.json.)
- Migrations live in `scripts/` and are idempotent with `--dry-run` support.

## What we do NOT do

- No raw secrets, tokens, or passwords in logs, error responses, or the DB.
- No stack traces or internal error messages in client responses
  (`{ error, code }` only).
- No `eval`, no dynamic code generation from user input.
