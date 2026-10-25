# Final Report V3 — Security & High-Value Features (branch security/hardening-v3)

Base: `origin/main` at b460720. The brief named branch `shopify-rebuild`;
that branch was already merged into main (PR #10). NOTE — updated
during this work: while this branch was being built, the user merged
the parity branch into main via PR #12 (new main head d1adbb2). The
three files both branches changed — docs/MANUAL_STEPS.md,
scripts/ensure-indexes.ts, and the dashboard sidebar — were MERGED
(parity content + security content, including the Security sidebar
entry in the parity sidebar's SETTINGS group), not overwritten, and
the merged sidebar was re-verified by lint/tsc/build. Main is never
touched by this branch. The route audit on this branch covers main's
117 routes as of the old base; parity's routes (now on main) will need
the same audit pass on the merged tree — see Open items.

## What was built

- **Threat model first** (docs/THREAT_MODEL.md, R1–R15 ranked) driving
  S1–S5 priorities, with honest residuals.
- **S1 Identity**: TOTP 2FA with QR setup, hashed single-use recovery
  codes, remember-device signed tokens, sessions/devices page with
  revoke one/all (sessionVersion invalidation in auth.ts), step-up
  tokens for sensitive actions, impossible-travel flag, truncated-IP
  login fingerprinting, API-key IP allowlists + read/write split +
  anomaly alerts. Owner transfer, invite expiry/single-use and
  last-owner protection were verified pre-existing, not rebuilt.
- **S2 Data**: AES-256-GCM versioned encryption for all new writes
  (legacy CryptoJS rows still decrypt; rotation script with --dry-run
  migrates them), DATA_MAP.md, self-serve export + 14-day-grace
  deletion, logger redaction extended to secret-shaped free text.
  GDPR webhook handlers and consent-gated analytics were verified
  pre-existing, not rebuilt.
- **S3 Hardening**: Mongo operator sanitizer, CSV formula
  neutralization (applied to /api/reports), SSRF guard (HTTPS-only,
  DNS + re-check, private/metadata blocked, signed webhooks), AI
  prompt-injection guard (delimit/strip/PII-redact/budget), and a
  static route-policy audit covering all 117 API routes
  (session 59, session-direct 24, oauth-state 5, webhook variants 4,
  public 13, cron-secret 9, api-key 3).
- **S4 Pipeline**: env validation now refuses weak/placeholder secrets
  in production and validates the keyring format; Docker was verified
  pre-existing (non-root, standalone, healthcheck). The CI security job
  ships as docs/security/CI-SECURITY.yml — it must be added via the
  web UI because the GitHub App cannot push workflow files.
- **S5 Monitoring**: SecurityEvent log (truncated IPs only, 365d TTL),
  owner alerts for critical events, admin security dashboard
  (/dashboard/security + /api/admin/security), incident runbooks,
  disclosure policy, security.txt.
- **F1 Features**: agency client workspaces + expiring portal links,
  discount/returns/basket analytics over real orders, pricing
  optimizer (suggest-only, never applies), inventory reorder/dead
  stock, cash-flow forecast, benchmarks with a 10-store cohort floor,
  alert channel senders (Slack/Telegram/Discord + WhatsApp via the
  existing sender), comments with @mentions/assignment, v1 idempotency
  keys, a typed JS SDK (sdk/getprofitcalc.ts), onboarding templates.

## Gates — actually run

- ESLint: PASS (0 errors, 0 warnings after fixes)
- TypeScript (`tsc --noEmit`): PASS (after clearing a stale `.next`
  from the parity branch's dev server, which had polluted the first run
  with phantom page errors — those pages do not exist on main)
- Vitest: **440 passed, 0 failed** (413 pre-existing + 27 new security tests)
- `npm run test:security`: 27 passed
- `npm run audit:routes`: PASS — 117 routes, 0 uncovered
- Production build: PASS (BUILD_EXIT:0; all new routes listed,
  including /dashboard/security, /api/auth/2fa/*, /api/admin/security,
  /api/analytics/f1, /api/agency/clients, /.well-known/security.txt)
- Playwright (real Chrome 156, full-binary workaround as in the parity
  retry): security spec **10/10**, smoke spec **5/5**

## Honest gaps — NOT claimed as done

1. **Passkeys (WebAuthn)**: not implemented. TOTP + recovery + trusted
   devices cover 2FA; a half-tested passkey flow would be worse.
2. **SAML SSO**: design only (docs/security/SSO-DESIGN.md). OIDC via
   the existing Google provider is the only live SSO path.
3. **2FA enforce-for-role**: Team.twoFactorRequiredForAdmins is a
   policy field, not yet enforced at login (enforcement hook is a
   follow-up; enabling the field today would do nothing, so it
   defaults to false and is documented, not advertised).
4. **Idle/absolute session timeouts**: NextAuth JWT expiry is the only
   timeout; separate idle/absolute timeouts are not implemented.
5. **CAPTCHA/Turnstile + register bot detection**: not implemented.
   Rate limiting + lockout (pre-existing) are the current protections.
6. **DPA/subprocessor pages, backup/restore drill, Sheets/BigQuery/
   Zapier connectors, subscription cohorts, purchase-order UI, PWA
   push for high-risk orders**: not built (engines or docs only, as
   listed in SECURITY_CHECKLIST.md). None is claimed as a feature.
7. **Discount-code-level profitability**: orders store discount totals,
   not codes, so /api/analytics/f1 reports totals and an explicit note
   — per-code rows await discount-code sync.
8. **ApiKey.recentUseCount reset job**: the anomaly counter grows
   until a daily reset job exists (see MANUAL_STEPS §4).
9. **Truncated-IP retention enforcement** (Team.ipRetentionDays):
   policy recorded in DATA_MAP.md; the TTL job enforcing it is a
   follow-up (SecurityEvent TTL of 365d is the current enforcement).
10. **UNVERIFIED in this VM**: live Shopify/Paddle/Meta round-trips,
    live GDPR webhook round-trip, live alert-channel sends, ZAP run,
    CI security job run, npm audit (registry 403, pre-existing),
    50k-order performance after the new features (no 50k dataset
    seeded), axe/Lighthouse.

## Manual steps for the merchant

See docs/MANUAL_STEPS.md: merge, ensure-indexes, encryption keyring
rotation (irreversible cutover — read it first), CI file via web UI,
cron jobs, and the irreversible decisions (P&L definition unchanged,
deletion grace, billing/SSO pricing).

## Files changed (summary)

~55 files: 5 docs + security docs dir, 4 scripts, 1 SDK, 14 new libs,
5 new models, 12 new API routes, 3 edited routes (keys, reports, v1
cogs), auth + api-helpers + api-key-auth + env + logger, 2 dashboard
pages, sidebar, layout, ensure-indexes, package.json scripts.
No secrets were committed; the CI template contains no SHAs (version
tags with explicit PIN-BY-SHA instructions — a first draft with
placeholder SHAs was caught and removed before commit).
