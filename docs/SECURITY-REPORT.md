# Note (2026-10-25): this historical report was edited to remove references
# to store platforms removed in Phase 1 (Shopify-only). The findings about
# the remaining platforms are unchanged.

# Phase 4 Security Report — GetProfitCalc

Date: 2026-10-16. Covers the security-hardening pass over authentication,
API authorization, OAuth, sync pipelines, secrets handling, and headers.

## Findings fixed

### F1 — Unauthenticated internal HTTP sync hops (critical)
`POST /api/stores/shopify/sync` (Phase 1) and `/api/ad-accounts/tiktok/sync` accepted a
**client-supplied `teamId`** with no session. The Shopify OAuth
callbacks and the `[storeId]/sync` dispatcher triggered them via
unauthenticated `fetch()`.

**Fix:** sync logic extracted into server-side libs
(`src/lib/sync/shopify.ts`, `tiktok-ads.ts`).
Callbacks/dispatcher now call the libs directly via `after()` — no HTTP hop.
Manual sync routes require a session (`requireAuth` + `write:data`
permission), validate `storeId` with Zod, and scope the store to the
caller's team. Client `teamId` is ignored everywhere.

### F2 — OAuth login-CSRF (high)
Meta/TikTok `state` params carried only the teamId (or an unverified
random nonce) with no server-side binding — an attacker could trick a victim
into completing the attacker's OAuth flow against the victim's team.

**Fix:** `src/lib/oauth-state.ts` — one-time nonce in an HttpOnly cookie,
embedded in `state`, verified and deleted (single-use) by the callback.
Applied to Meta and TikTok.

### F3 — Dead Meta spend-sync hop (medium)
Meta callback fire-and-forget `fetch()`ed `/api/ad-accounts/meta/sync`,
which was never built (silent 404 — initial backfill never ran).

**Fix:** dead hop removed; Meta spend-sync endpoint scheduled for Phase 7
(TODO in code). TikTok got a real lib (`syncTikTokAdSpend`) called via
`after()`.

### F4 — No credential-login throttling (high)
`POST /api/auth/callback/credentials` had no rate limit; only the DB
lockout (5 fails → 15 min) protected it.

**Fix:** `[...nextauth]/route.ts` now wraps `handlers.POST` with a per-IP
bucket and a per-email bucket (10 req / 10 min each), parsed from a request
clone so NextAuth still receives the intact body.

### F5 — Email verification not enforced (medium)
`POST /api/auth/verify-email` existed but credential login never checked it.

**Fix:** `authorize()` throws `EMAIL_NOT_VERIFIED` after successful password
validation (ordering avoids user enumeration). Login page shows an inline
"verify your email" panel with resend (`POST /api/auth/verify-email/resend`,
rate-limited, enumeration-safe). Migration
`scripts/backfill-email-verified.ts` grandfathers pre-existing credential
users (`emailVerified := createdAt`, idempotent, `--dry-run`).

### F6 — Raw tokens stored in DB (high)
Legacy `users.resetPasswordToken` and `teams.members[].inviteToken` held
**raw** single-use tokens.

**Fix:** Phase 4 code already stores SHA-256 hashes
(`resetPasswordTokenHash`, `inviteTokenHash`); migrations
`scripts/migrate-reset-tokens.ts` and `scripts/migrate-invite-tokens.ts`
purge legacy raw fields (idempotent, `--dry-run`, count logging).

### F7 — Mongoose imports in Edge runtime (high)
`auth.config.ts` (imported by `middleware.ts` on Edge) dynamically imported
`@/lib/db` / `@/models/User` inside the `jwt` callback.

**Fix:** `jwt` in `auth.config.ts` is now pure (token-field copy only).
DB-backed refresh (teamId/teamRole backfill, password-change session
invalidation) moved to `auth.ts`, which is Node-only.

### F8 — Non-atomic Redis rate limiter (medium)
`MULTI/EXEC` + a **separate** `EXPIRE` request could leave keys without TTL
and race window setup.

**Fix:** single Lua `EVAL` — `INCR` + conditional `EXPIRE` + `TTL` in one
atomic step.

### F9 — Missing disconnect endpoints (medium)
No way to disconnect a store/ad account; tokens lived on after "removal".

**Fix:** `DELETE /api/stores/[storeId]` and `DELETE /api/ad-accounts/[id]`
(`write:data` permission, team-scoped) — best-effort provider revocation
(Meta `DELETE /me/permissions`, TikTok `/oauth2/revoke/`), then local
credential wipe + `syncStatus: "disconnected"`. Models extended for nullable
tokens.

### F10 — Public blog routes unthrottled / unvalidated (low)
`GET /api/blogs`, `/categories`, `/tags` had no rate limit; the list route
took unbounded `page`/`limit` and an unvalidated `sortBy` straight into
`.sort()`.

**Fix:** `lenient` rate-limit preset on all; Zod query schema
(page 1–1000, limit 1–50, `sortBy` enum whitelist). Structured error shape,
no stack leakage.

### F11 — CSP missing `frame-ancestors` (low)
**Fix:** `frame-ancestors 'none'` added in `next.config.ts`.

### F12 — Stale `@types/jspdf` (low)
jspdf v4 ships its own types; removed the v1-era `@types/jspdf`.

## Verification

- `npx tsc --noEmit` — **clean** (fixed 5 errors: tiktok entitlement action,
  cogs `bulkWrite` typing, 3 reports enum mismatches).
- `npx vitest run` (targeted): shopify 18 ✓, entitlements 26 ✓,
  permissions 34 ✓, sync-mappers 8 ✓, oauth-state 6 ✓, password 8 ✓ —
  **100 passed**.
- ESLint on touched files: **0 errors** (3 pre-existing unused-var warnings
  on auth pages, unrelated).
- New tests: `sync-mappers.test.ts` (status mapping incl.
  zero-divisor money), `oauth-state.test.ts` (round-trip, tamper, missing
  cookie, replay/single-use, uniqueness), `password.test.ts` (policy
  boundaries, HIBP hit/miss/fail-open with mocked fetch, k-anonymity
  assertion that only the hash prefix leaves the box).

## Not verified / residual risks

- **`npm audit` could not run** — the sandbox npm registry proxy denies the
  audit endpoint (403 `policy_denied`). Run `npm audit` / `npm audit fix`
  on a normal network before release.
- **Live OAuth round-trips** (Shopify/Meta/TikTok) not exercised —
  needs provider apps + tunnel. The nonce cookie flow is unit-tested.
- **Redis Lua path** not exercised against real Upstash (no credentials in
  this environment); in-memory fallback is what the tests cover.
- `npm install` currently requires `--legacy-peer-deps` (vitest/vite
  `@types/node` peer conflict) — consider pinning compatible versions.
- Meta ad-spend sync endpoint still missing (Phase 7).
- Full `npm run build` and full test suite pending at phase commit time.
