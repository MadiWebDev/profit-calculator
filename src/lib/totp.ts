/**
 * TOTP (RFC 6238) for two-factor authentication — dependency-free.
 * Uses Node crypto HMAC-SHA1, base32 secrets, 30s steps, 6 digits.
 * Secrets are stored ENCRYPTED (see encryption-v2) — never raw in DB.
 * Recovery codes are stored as SHA-256 hashes only (like passwords).
 */
import { createHmac, timingSafeEqual, randomBytes, createHash } from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: string, atMs = Date.now(), stepSec = 30, digits = 6): string {
  const counter = Math.floor(atMs / 1000 / stepSec);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Verify with a ±window-step tolerance (default 1 step each way). */
export function verifyTotp(secret: string, code: string, atMs = Date.now(), window = 1): boolean {
  const clean = String(code).replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  for (let w = -window; w <= window; w++) {
    const expected = totpCode(secret, atMs + w * 30_000);
    if (expected.length === clean.length && timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) {
      return true;
    }
  }
  return false;
}

export function totpOtpauthUrl(secret: string, account: string, issuer = "GetProfitCalc"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Recovery codes: shown once, stored only as SHA-256 hashes. */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(5).toString("hex").toUpperCase().match(/.{4}/g)!.join("-"));
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}

export function verifyRecoveryCode(code: string, hashes: string[]): number {
  const h = hashRecoveryCode(code);
  return hashes.findIndex((x) => x.length === h.length && timingSafeEqual(Buffer.from(x), Buffer.from(h)));
}
