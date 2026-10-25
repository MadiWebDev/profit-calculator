# Incident Response Runbooks (S5)

Severity: SEV1 = active breach / data exfiltration / billing compromise.
SEV2 = compromised account, leaked token, suspicious tenant activity.
SEV3 = single failed-login spike, webhook signature failures.

## General (all incidents)

1. Preserve evidence first: export SecurityEvent rows for the team(s)
   and time window (`/api/admin/security` + DB query) before deleting
   anything. Do not tip off the attacker by revoking in a way that
   reveals detection before evidence is captured — except for SEV1,
   where containment comes first.
2. Contain, eradicate, recover, then write the post-incident note in
   docs/security/incidents/ (date, scope, root cause, fix, tests).
3. Notify affected merchants within 72 hours of confirming a personal
   data breach (GDPR Art. 33/34 clock starts at confirmation, not
   discovery). Shopify's GDPR webhooks are not a substitute for this
   notification.

## Leaked token (Shopify / ad platform / courier)

1. Revoke at the provider: Shopify — delete the store token via the
   partner dashboard / uninstall; Meta — DELETE /me/permissions;
   TikTok — /oauth2/revoke/. The app's disconnect endpoint does the
   Meta/TikTok calls best-effort, then wipes local tokens.
2. Rotate the app's encryption keys if the leak included ENCRYPTION_KEY
   material: add the new key to ENCRYPTION_KEYS_JSON, set
   ENCRYPTION_CURRENT_KEY_ID, run the rotation script --apply, then
   remove the old key from the keyring (reads of already-migrated rows
   use the new key; unmigrated legacy rows would break — run --dry-run
   first and confirm 0 failures).
3. Revoke affected API keys (DELETE /api/keys) and bump the affected
   users' sessionVersion (revoke-all on the security page).

## Compromised merchant account

1. Revoke all sessions for the user (security page → Revoke all).
2. Force a password reset (reset-password flow) and require 2FA
   re-enrolment (disable + setup + enable with new recovery codes).
3. Review SecurityEvents: new-device logins, mass exports, key
   creations, member changes in the last 30 days.
4. If the attacker changed team membership or billing, restore from
   audit log entries and notify the owner.

## Data breach notification timeline

- T+0: confirm scope (which teams, which fields — see DATA_MAP.md).
- T+24h: draft notification (what happened, fields affected, what we
  did, what merchants should do).
- T+72h: notify the supervisory authority if personal data is involved
  (GDPR Art. 33), and affected merchants without undue delay (Art. 34)
  when the risk is high.
- T+7d: post-incident review with a fix and a regression test.

## Shopify token revocation (quick reference)

- Store disconnect in-app: DELETE /api/stores/[storeId] (wipes tokens
  locally after best-effort provider revocation).
- Shop redact (GDPR): Shopify sends shop/redact 48h after uninstall;
  the webhook handler deletes orders/products and wipes tokens.
- Never re-use a revoked token: sync jobs skip stores with
  syncStatus "disconnected".

## Status page & disclosure

- Status: publish incident status on the marketing site's status page
  (manual step — no status service is wired in this branch).
- Vulnerability disclosure: see /.well-known/security.txt and the
  disclosure policy page (docs/security/DISCLOSURE.md). Reports are
  triaged within 5 business days; do not publish details before a fix
  or 90 days, whichever comes first.
