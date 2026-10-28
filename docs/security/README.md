# Security docs index

- ../THREAT_MODEL.md — assets, actors, entry points, top 15 risks (R1–R15).
- ../DATA_MAP.md — PII inventory, purpose, retention.
- ../INCIDENT_RESPONSE.md — runbooks, breach timeline, token revocation.
- SSO-DESIGN.md — SAML/OIDC design for Pro/agency (design only).
- DISCLOSURE.md — vulnerability disclosure policy.
- CI-SECURITY.yml — CI security job template (add via web UI; see below).
- zap-baseline-report.html — ZAP baseline report (generated manually,
  not committed by default; run scripts/zap-baseline.sh before release).

## Why CI-SECURITY.yml is not in .github/workflows/

The Muse GitHub App cannot push workflow files (403, workflow scope).
Copy CI-SECURITY.yml to .github/workflows/security.yml via the GitHub
web UI or a local git push, pin the action SHAs at that time (the
template uses version tags with PIN-BY-SHA notes — never copy an
unverified SHA), and then run it on a PR to verify.
