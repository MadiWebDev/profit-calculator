# Security Checklist — every control, where it lives, its test

Run the suite with `npm run test:security` (vitest, security dir) and
`npm run audit:routes` (static route-policy crawl). E2E: e2e/security.spec.ts.

## S1 Identity and access

| Control | Code | Test |
|---|---|---|
| TOTP 2FA (RFC 6238, no new dependency) | src/lib/totp.ts; routes /api/auth/2fa/setup, /enable, /verify, /disable | totp.test.ts; e2e 2FA page renders |
| Recovery codes (SHA-256, single-use) | totp.ts generateRecoveryCodes/hashRecoveryCode; enable route | totp.test.ts (recovery) |
| Enforce-for-role (owners/admins) | Team.twoFactorRequiredForAdmins (policy field; enforcement hook is a follow-up — see FINAL_REPORT_V3) | — (field + doc; NOT claimed as enforced) |
| Remember-device (signed, revocable) | src/lib/trusted-device.ts sign/verifyTrustedDevice; trusted-check route; SessionDevice.trustedUntil | ssrf-ai-trusted.test.ts (trusted device) |
| Passkeys (WebAuthn) | NOT implemented — see THREAT_MODEL.md residual | — |
| Sessions/devices list, revoke one/all | /api/auth/sessions; SessionDevice model; auth.ts sessionVersion check | (API route; no DB test in this env) |
| Auto-revoke on password change | auth.ts jwt passwordChangedAt check (pre-existing, extended with sessionVersion) | — (pre-existing behaviour) |
| Idle/absolute timeouts | NextAuth JWT expiry (existing session config); NOT separately implemented — see FINAL_REPORT_V3 | — |
| Step-up before sensitive actions | src/lib/step-up.ts requireStepUpIf2fa; applied to privacy export/delete; step-up token from 2FA verify | ssrf-ai-trusted.test.ts (step-up scope) |
| New-device alert, impossible travel flag | security-events.ts truncateIp/deviceFingerprint/isImpossibleTravel; recordSecurityEvent | ssrf-ai-trusted.test.ts (impossible travel) |
| Breached-password (HIBP k-anonymity) | Pre-existing password.ts (verified by reading, not rebuilt) | password.test.ts (pre-existing) |
| CAPTCHA/Turnstile after failures, bot detection on register | NOT implemented — see FINAL_REPORT_V3 | — |
| Invite expiry + single-use, last-owner protection, owner transfer | Pre-existing team routes (verified by reading) + lastOwnerGuard | (pre-existing) |
| SSO SAML/OIDC | Design only: docs/security/SSO-DESIGN.md; OIDC via existing Google provider only | — |
| API keys: IP allowlist, expiry, scopes, read/write split, anomaly alerts | models/ApiKey (ipAllowlist, accessLevel, rotationReminderDays, recentUseCount); api-key-auth.ts (allowlist + anomaly + read-only enforcement); /api/keys create | (route-level; no DB test in this env) |

## S2 Data protection

| Control | Code | Test |
|---|---|---|
| Versioned AES-256-GCM encryption | src/lib/encryption-v2.ts (keyring, v2 format, legacy decrypt) | crypto-and-sanitize.test.ts |
| Key rotation script, zero-downtime, --dry-run | scripts/rotate-encryption-keys.ts | (dry-run only in this env; no DB) |
| PII inventory + retention | docs/DATA_MAP.md | — |
| Retention TTL / purge | SecurityEvent TTL index (365d); scripts/purge-deleted-accounts.ts (14d grace) | — |
| Field-level encryption/hashing | 2FA secret GCM; recovery/invite/reset/API keys SHA-256 | totp/crypto tests |
| Self-serve export (JSON) + deletion (grace) | /api/privacy/export, /api/privacy/delete | e2e (unauth rejected) |
| Shopify GDPR webhooks | Pre-existing webhook handler (data_request/redact/shop-redact) — verified by reading | — (live round-trip UNVERIFIED) |
| Cookie consent blocks GA/AdSense | Pre-existing ConsentScripts (returns null without consent) — verified by reading | smoke e2e (cookie banner) |
| DPA / subprocessor pages | NOT built — see FINAL_REPORT_V3 | — |
| Backup + restore drill | NOT built (no backup infra in this env) — see FINAL_REPORT_V3 | — |
| Logger redaction (secret-shaped values) | src/lib/logger.ts redact (bearer/sk-/64-hex) | logger-redaction.test.ts |

## S3 Application hardening

| Control | Code | Test |
|---|---|---|
| Mongo operator sanitizer | src/lib/sanitize-mongo.ts | crypto-and-sanitize.test.ts |
| Strict Zod on every route + route-policy crawl | scripts/audit-routes.ts (117 routes, all covered) | `npm run audit:routes` |
| Request-size / JSON depth limits | Pre-existing parseBody 5MB cap (verified by reading) | — |
| CSV injection neutralization | src/lib/csv-injection.ts; applied in /api/reports | crypto-and-sanitize.test.ts |
| CSV import limits | Pre-existing courier CSV validation (verified by reading) | courier tests (pre-existing) |
| SSRF guard + signed outbound webhooks | src/lib/ssrf.ts (validateOutboundUrl, sign/verifyOutboundWebhook) | ssrf-ai-trusted.test.ts |
| AI prompt-injection guard | src/lib/ai-guard.ts (delimit, strip, PII redact, budget) | ssrf-ai-trusted.test.ts |
| Authorization crawl (401 / cross-tenant 404 / viewer read-only) | audit-routes (policy presence) + pre-existing tenant-isolation tests | tenant-isolation.test.ts (pre-existing) |
| File/upload safety | Pre-existing Cloudinary signed uploads (verified by reading) | — |
| Headers: CSP nonces, SRI, COOP/COEP, HSTS preload, security.txt | CSP unsafe-inline kept where Next.js requires it (documented residual); /.well-known/security.txt route; HSTS preload + COOP/COEP pre-existing in next.config.ts | e2e security.txt |
| Abuse: per-tenant/per-plan limits, trial abuse, queue caps, webhook flood | Pre-existing rate-limit + trial gates (verified by reading); alert-channels quiet hours | — (full abuse suite NOT built — see FINAL_REPORT_V3) |

## S4 Supply chain / pipeline

| Control | Code | Test |
|---|---|---|
| npm audit gate, Dependabot/Renovate, lockfile check, pinned actions, secret scan, SAST, Trivy, SBOM | docs/security/CI-SECURITY.yml template (ADD VIA WEB UI — GitHub App cannot push workflows) | — (CI run UNVERIFIED until added) |
| Docker non-root, read-only, no dev deps, healthcheck, minimal base | Dockerfile (pre-existing: non-root nextjs user, standalone output, healthcheck) — verified by reading | — |
| Env validation, refuse weak secrets, per-env keys, rotation docs | src/lib/env.ts (production weak-secret refusal + keyring format check) | — |
| ZAP DAST baseline | scripts/zap-baseline.sh + docs/security/ (report generated manually) | — (run UNVERIFIED) |

## S5 Monitoring / incident response

| Control | Code | Test |
|---|---|---|
| Security event log + owner alerts (critical) | src/lib/security-events.ts, src/lib/security-email.ts, models/SecurityEvent | ssrf-ai-trusted.test.ts (helpers) |
| Admin security dashboard | /api/admin/security + /dashboard/security page | e2e security.spec.ts |
| Incident runbooks, status page, disclosure policy | docs/INCIDENT_RESPONSE.md, docs/security/DISCLOSURE.md, security.txt | — (status page is a manual step) |

## F1 Features

| Feature | Code | Test |
|---|---|---|
| Agency mode + white-label portal links | models/ClientWorkspace, /api/agency/clients | e2e (unauth rejected) |
| Discount profitability | src/lib/f1-engines.ts discountProfitability; /api/analytics/f1 | f1-engines.test.ts |
| Returns/refunds analytics | f1-engines.ts returnsAnalytics; /api/analytics/f1 | f1-engines.test.ts |
| Market basket / upsell | f1-engines.ts marketBasket; /api/analytics/f1 | f1-engines.test.ts |
| Pricing optimizer (suggest only) | f1-engines.ts pricingOptimizer | f1-engines.test.ts |
| Inventory / purchasing (reorder, dead stock) | f1-engines.ts inventoryAnalysis (engine only; PO/supplier UI NOT built) | f1-engines.test.ts |
| Subscription cohort profit | NOT built — no subscription-order data model in this branch | — |
| Cash-flow forecast | f1-engines.ts cashFlowForecast | f1-engines.test.ts |
| Alert channels (Slack/Telegram/Discord/WhatsApp) | src/lib/alert-channels.ts (senders + quiet hours) | — (live send UNVERIFIED) |
| Integrations hub: Sheets, Looker/BigQuery, Zapier/Make, v1 + SDK | v1 idempotency (models/IdempotencyKey, lib/idempotency, v1/cogs POST); sdk/getprofitcalc.ts; Sheets/BigQuery/Zapier NOT built | — |
| Collaboration: comments, @mentions, assignment | models/Comment, /api/comments | e2e (unauth rejected) |
| Mobile PWA push | Pre-existing manifest + sw.js (verified by reading); push for high-risk orders NOT built (needs VAPID setup) | — |
| Benchmarks (opt-in, min cohort) | f1-engines.ts benchmarkCompare (cohort floor 10) | f1-engines.test.ts |
| Onboarding templates | src/lib/onboarding-templates.ts | — |
