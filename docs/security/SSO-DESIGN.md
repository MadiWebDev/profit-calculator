# SSO Design — SAML / OIDC for Pro / Agency plan (S1.4, design only)

Status: DESIGN ONLY in this branch. No SAML/OIDC IdP route is shipped,
because a half-built SSO endpoint (signature validation, assertion
handling, Just-In-Time provisioning) is a high-severity attack surface.
This document is the implementation spec for the follow-up.

## Model

- Per-team IdP configuration (new model TeamSsoConfig, team-scoped):
  entityId, ssoUrl, certificate (stored encrypted, GCM), attribute
  mapping (email, name), JIT provisioning flag, allowed domains.
- Login flow: /auth/sso/[teamSlug] → redirect to IdP with a signed
  request (SAML AuthnRequest or OIDC authorization code + PKCE) →
  callback verifies signature / ID token, maps attributes, finds or
  JIT-creates a user, creates a team membership with the IdP-mapped
  role (never owner by default), then issues a normal NextAuth session
  (so 2FA, sessionVersion and step-up all still apply).
- Security requirements: signed assertions mandatory, audience +
  recipient + timestamp validation, replay protection via assertion ID
  cache, encrypted NameIDs only, no JIT owner creation, domain
  verification before enabling SSO for a team (DNS TXT or email-domain
  proof), and an IdP-initiated logout (SLO) endpoint.
- Billing: SSO is a Pro/agency entitlement — checkEntitlement before
  enabling, same pattern as api.access.
- Rollback: disabling SSO must not lock users out — password login
  remains available for existing users, and the team owner can always
  sign in with credentials + 2FA.

## Why OIDC is easier than SAML

OIDC reuses the existing Google provider pattern (authorization code +
ID token verification); SAML needs XML signature handling and is the
larger, riskier build. Recommendation: ship OIDC first, SAML second,
both behind the same TeamSsoConfig model.
