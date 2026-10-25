# Threat Model — GetProfitCalc (branch security/hardening-v3)

Base: `origin/main` at b460720. The brief named branch `shopify-rebuild`;
that branch was already merged into main (PR #10), so this work branches
from main, as the parity work did. Main is never touched by this branch.

Read with docs/SECURITY-REPORT.md (Phase 4 fixes F1–F12),
docs/AUDIT.md and docs/DECISIONS.md. This document drives the S1–S5
priority order below: fix the highest-ranked risks first, and do not
claim a risk closed until its named test passes.

## Assets (what an attacker wants)

1. Shopify OAuth tokens (store access) — full read of orders, products,
   customers; write via admin API if scopes allow.
2. Merchant PII — customer names, emails, phones, addresses on orders;
   merchant emails and team membership.
3. Money truth — profit reports, COGS, ad spend; corrupting them changes
   pricing and payout decisions.
4. Billing — Paddle customer/subscription linkage, plan entitlements.
5. Ad platform tokens (Meta/TikTok/Google) and courier API keys.
6. The platform itself — tenant isolation: one merchant must never see
   another merchant's orders, reports, or tokens.

## Actors

- **Remote unauthenticated attacker** — probes APIs, webhooks, auth.
- **Authenticated low-privilege user** (viewer/member, or a former member
  whose access was not revoked) — tries privilege escalation and
  cross-tenant access.
- **Malicious merchant / tenant** — tries to read other tenants, abuse
  trials, flood webhooks/jobs, or exfiltrate via exports.
- **Malicious third-party data** — order/product/customer text, CSV
  imports, webhook payloads, and ad-platform data that reach prompts,
  exports, or queries as if they were instructions.
- **Compromised merchant account** — credential stuffing / phishing;
  the blast radius is set by session and 2FA controls.
- **Supply-chain attacker** — compromised dependency, CI secret leak,
  or a malicious container layer.
- **Insider / ex-employee** — stale sessions, API keys, invites.

## Entry points

Web: Next.js pages + 121 API routes (counted from `src/app/api/**/route.ts`
on this branch), NextAuth credentials + Google, Paddle/Shopify/Meta/
TikTok webhooks, Shopify OAuth callbacks, CSV import, outbound webhooks
(WebhookSubscription), AI endpoints (ai-insights, copilot over aggregates),
public marketing/blog APIs, Paddle checkout, email links (verify, reset,
invite — all SHA-256 hashed, single-use, expiring).

## Trust boundaries

- Browser ↔ server: session cookie (JWT) is the only trust; every API
  route must re-check auth, team scope, and role server-side. The JWT
  role is a display hint only; mutating routes re-read the role from DB.
- Webhook ↔ server: HMAC signature + timestamp + dedup, never a session.
- Tenant ↔ tenant: `teamId` from the session, never from client input.
- Merchant data ↔ LLM: merchant/order text is DATA, never instructions.
- App ↔ providers: tokens are encrypted at rest and never returned in
  API responses; provider revocation on disconnect is best-effort.

## Top 15 risks, ranked (likelihood × impact, before this branch)

| # | Risk | Why it ranks here | Control built in this branch | Test |
|---|---|---|---|---|
| R1 | Account takeover via password-only login | No 2FA; credential stuffing is the cheapest attack on a SaaS with money data | TOTP 2FA + hashed recovery codes, enforce-for-role, remember-device signed tokens, step-up for sensitive actions | `totp.test.ts`, `two-factor.test.ts`, e2e 2FA login |
| R2 | Stale sessions after password change / member removal | JWT sessions were invalidated only on password change (5-min check); no session list or revoke | Session/device registry, revoke one/all, sessionVersion invalidation, auto-revoke on password change | `sessions.test.ts` |
| R3 | Unauthenticated encryption of tokens | `encryption.ts` used CryptoJS AES (CBC, no authentication, single unversioned key) — tampered ciphertext decrypts or fails opaquely | AES-256-GCM, versioned keyring, legacy decrypt for migration, rotation script with --dry-run | `encryption-v2.test.ts`, rotation dry-run |
| R4 | Cross-tenant / privilege-escalation regression | 121 routes; a single new route without requireAuth or team scoping breaks the whole model | Automated route crawl: every route must declare an auth policy (session / API key / webhook / public), unauthenticated → 401, cross-tenant id → 404, viewer cannot mutate | `route-policy.test.ts`, `scripts/audit-routes.ts` (CI) |
| R5 | NoSQL operator injection | Queries built from user input (filters, search, sort) could carry `$ne`/`$gt` operators | Shared `sanitizeMongo` applied to all user-supplied filter objects, plus strict Zod on routes | `sanitize-mongo.test.ts` |
| R6 | SSRF via user-supplied webhook / URL fields | Outbound fetches to attacker URLs can hit cloud metadata and internal services | SSRF guard: HTTPS only, DNS resolve + re-check, private/loopback/link-local/metadata ranges blocked, timeouts, redirect/size caps, timestamp+HMAC signing | `ssrf.test.ts` |
| R7 | CSV/Excel formula injection in exports | Report CSVs embed merchant/order text; a cell starting `=`, `+`, `-`, `@` executes in Excel | `neutralizeCsvCell` applied in every export path (parity reports, orders, products, scheduled reports) | `csv-injection.test.ts` |
| R8 | Prompt injection from order/product text into AI | AI insights builds prompts from merchant data; hostile text could steer the model or exfiltrate | Delimit merchant data as data, strip instruction-like markers, never send PII, per-tenant token/cost caps, PII-free prompt logging | `ai-guard.test.ts` |
| R9 | API key abuse | Keys had scopes and expiry but no IP allowlist, no read/write split beyond scopes, no rotation reminders or anomaly alerts | Per-key IP allowlist, expiry, read-only vs write scopes, rotation reminders, anomaly alerts on unusual use | `api-keys.test.ts` |
| R10 | PII over-retention / GDPR exposure | Raw IPs, phones, emails retained without a documented purpose, TTL, or purge; Shopify GDPR webhooks unverified end to end | DATA_MAP.md with purpose + retention per field, IP truncation + TTL purge job, self-serve export/deletion with grace period, GDPR webhook tests | `data-map` + `privacy.test.ts` |
| R11 | Secret / token leakage in logs | Logger redacted key names but not secret-shaped values in free text | Extended redaction: secret-shaped strings (long hex/base64, `sk-`/`pk-` patterns, bearer tokens) redacted in values and messages, fixture test with real-looking secrets | `logger-redaction.test.ts` |
| R12 | Supply-chain / CI compromise | No audit gate, no pinned actions, no secret scanning, no SBOM in the existing CI | CI security job template (audit fail on high/critical, gitleaks, CodeQL/Semgrep, Trivy, SBOM) — see S4 note: workflow files cannot be pushed via the GitHub App, so the file ships in-repo and the user adds it via the web UI (docs/MANUAL_STEPS.md) | `docs/security/CI-SECURITY.yml` |
| R13 | Abuse: trial farming, webhook floods, job overload | Disposable emails, repeated trials, unbounded queues/webhooks | Disposable-email check, trial fingerprinting, per-tenant/per-plan rate limits, webhook flood protection + backpressure, job concurrency caps | `abuse.test.ts` |
| R14 | Weak transport / header gaps | CSP still allows `unsafe-inline` scripts in production (Next.js bootstrap); no security.txt, no SRI for third-party scripts | CSP nonce plan documented, `/.well-known/security.txt`, SRI guidance, HSTS preload already on, COOP/COEP already same-origin; unsafe-inline kept only where Next.js requires it, documented as residual | `security.txt` route test |
| R15 | No detection: breach discovered by customers | Failed logins, 2FA failures, key creation, mass exports were logged but not alerted or surfaced | SecurityEvent log, owner alerts for critical events, admin security dashboard, incident runbooks | `security-events.test.ts`, e2e dashboard |

## Explicitly out of scope / residual (honest, not hidden)

- **WebAuthn passkeys**: implemented only if the library fits cleanly
  without a new heavy dependency. Decision: NOT implemented in this
  branch — TOTP + recovery codes + trusted devices cover the 2FA
  requirement; passkeys are a documented follow-up in FINAL_REPORT_V3
  (adding `webauthn` would need a new dependency and a second login
  flow, and shipping a half-tested one would be worse than TOTP done
  well). The login page notes passkeys as planned.
- **SAML SSO**: design document only (Pro/agency plan). OIDC is
  implemented only via the existing Google provider path; a full
  generic OIDC/SAML IdP is a follow-up, not a half-built route.
- **Live Shopify GDPR webhook round-trip**: verified with signed
  fixture payloads and tests, not a live Shopify store (no credentials
  in this environment).
- **ZAP DAST**: scripted baseline script ships (`scripts/zap-baseline.sh`
  + report dir `docs/security/`); a live ZAP run needs a running app
  and ZAP binary, so it is a manual step, not a claimed pass.
- **P&L parity definition**: unchanged from the parity branch
  (dashboard ad spend vs allocated spend + extended other costs).
  Changing it needs an explicit user decision, as before.

## How to use this document

Every phase below references its R-numbers. A phase is done when its
controls exist, its tests pass, and this document's "Test" column can
be re-run by `npm run test:security` or the named script. If a control
cannot be verified here, it is listed in FINAL_REPORT_V3 under
UNVERIFIED with its exact blocker — never marked passed.
