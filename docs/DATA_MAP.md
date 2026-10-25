# Data Map — PII inventory, purpose, retention (S2.2)

Every field below is stored only for the stated purpose. "Searchable"
means the field is queried by value (so it cannot be hashed); all other
PII is hashed or encrypted where the brief allows. Retention jobs:
security events expire via TTL (365d), raw IPs are never stored (only
truncated form), deletion purge runs via scripts/purge-deleted-accounts.ts.

| Field | Where | Purpose | Retention | Protection |
|---|---|---|---|---|
| Merchant email, name | User | Account, login, alerts | Until deletion request + 14d grace | Lowercased, unique; never in logs |
| Merchant password hash | User | Login | Until change (bcrypt) | bcrypt; never returned |
| 2FA secret | User | TOTP verification | Until 2FA disabled | AES-256-GCM (encryption-v2) |
| Recovery code hashes | User | 2FA fallback, single-use | Until used or 2FA disabled | SHA-256 only |
| Customer email / name / phone | Order | Profit attribution, order display | Until store deletion or GDPR redact | GDPR redact unsets email; phone not hashed (needed for COD contact display — see note) |
| Customer address / city / postal | Order | Courier + country analysis | Until store deletion | City/country used for analytics; full address only on order detail |
| IP address | — | Never stored raw | — | Truncated (last octet/hextet removed) in SecurityEvent/SessionDevice; full IP only in transient request handling |
| Session device fingerprint | SessionDevice | Sessions page, revoke | Until revoke or 365d | SHA-256 of UA + truncated IP |
| Shopify/Meta/TikTok tokens | Store/AdAccount | Sync | Until disconnect (wiped) | AES-256-GCM v2 (new writes); legacy CryptoJS rows migrated by rotate script |
| Courier API keys | Courier | Tracking | Until courier deleted | AES-256-GCM v2 (new writes) |
| API key hashes | ApiKey | Public API auth | Until revoke/expiry | SHA-256 only; raw key shown once |
| Invite/reset/verify token hashes | Team/User | Single-use flows | Until use/expiry | SHA-256 only |
| Webhook payloads | WebhookEvent | Dedup/audit | 30d (existing dedup window) | Payloads excluded from logs; bodies not stored in SecurityEvent |

Note on phone hashing: the brief asks for field-level hashing "where
search is not required". Customer phone IS used for COD contact and
support display, so it stays readable on the order record and is
instead protected by tenant scoping + GDPR redact (which unsets email;
phone redaction on GDPR request is a follow-up — see FINAL_REPORT_V3).

## Retention jobs

- `scripts/purge-deleted-accounts.ts --apply` (cron, weekly): deletes
  accounts past their 14-day grace period.
- SecurityEvent TTL index: 365 days.
- Team.ipRetentionDays (default 90) is the policy value for truncated-IP
  records; the TTL job that enforces it is a follow-up (see
  FINAL_REPORT_V3) — truncated IPs are low-risk, but the policy is
  recorded here so it is not forgotten.
- Raw IP purge: no job needed — raw IPs are never persisted.
