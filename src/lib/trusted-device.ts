/**
 * Remember-device + step-up tokens (S1.1, S1.2). Both are HMAC-signed
 * (NEXTAUTH_SECRET), bound to a device fingerprint, and expiring.
 * They are NOT session tokens: a trusted-device token only skips the
 * 2FA code step, it never authenticates on its own — the caller must
 * already hold a valid NextAuth session. A step-up token only proves
 * a fresh 2FA check for one sensitive action class.
 */
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "";
  if (!s) throw new Error("NEXTAUTH_SECRET is required for device tokens");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function signTrustedDevice(userId: string, fingerprint: string, days = 30): string {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const payload = `trusted:${userId}:${fingerprint}:${exp}`;
  return Buffer.from(`${payload}:${sign(payload)}`).toString("base64url");
}

export function verifyTrustedDevice(token: string, userId: string, fingerprint: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 5 || parts[0] !== "trusted") return false;
    const [, uid, fp, expStr, sig] = parts;
    if (uid !== userId || fp !== fingerprint) return false;
    if (Date.now() > Number(expStr)) return false;
    const payload = `trusted:${uid}:${fp}:${expStr}`;
    const expected = sign(payload);
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function signStepUp(userId: string, scope: string, minutes = 10): string {
  const exp = Date.now() + minutes * 60 * 1000;
  const payload = `stepup:${userId}:${scope}:${exp}`;
  return Buffer.from(`${payload}:${sign(payload)}`).toString("base64url");
}

export function verifyStepUp(token: string, userId: string, scope: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 5 || parts[0] !== "stepup") return false;
    const [, uid, sc, expStr, sig] = parts;
    if (uid !== userId || sc !== scope) return false;
    if (Date.now() > Number(expStr)) return false;
    const payload = `stepup:${uid}:${sc}:${expStr}`;
    const expected = sign(payload);
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Sensitive action classes that require a fresh step-up token. */
export const STEP_UP_SCOPES = ["billing", "api-keys", "member-removal", "data-export", "data-deletion"] as const;
export type StepUpScope = (typeof STEP_UP_SCOPES)[number];
