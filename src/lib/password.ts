/**
 * Password policy + breached-password screening.
 *
 * Policy: minimum 10 characters, must contain at least one letter and one
 * number or symbol. Breached check uses the HaveIBeenPwned k-anonymity API
 * (only the first 5 chars of the SHA-1 hash leave the server); it fails open
 * on network errors so sign-up isn't blocked by an outage, but logs a warning.
 */
import { createHash } from "crypto";
import { logger } from "@/lib/logger";

export interface PasswordCheck {
  ok: boolean;
  reason?: string;
}

export function checkPasswordPolicy(password: string): PasswordCheck {
  if (password.length < 10) {
    return { ok: false, reason: "Password must be at least 10 characters long." };
  }
  if (password.length > 128) {
    return { ok: false, reason: "Password must be at most 128 characters long." };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, reason: "Password must contain at least one letter." };
  }
  if (!/[0-9\W_]/.test(password)) {
    return { ok: false, reason: "Password must contain at least one number or symbol." };
  }
  return { ok: true };
}

/**
 * Check whether a password appears in known breaches (HIBP Pwned Passwords).
 * Returns true when breached. Fails open (returns false) on network error.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "GetProfitCalc/1.0" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      logger.warn("HIBP check failed (fail-open)", { status: res.status });
      return false;
    }
    const body = await res.text();
    return body.split("\n").some((line) => line.split(":")[0]?.trim() === suffix);
  } catch (e) {
    logger.warn("HIBP check error (fail-open)", {}, { message: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** SHA-256 hash for single-use tokens (invite, reset, verify) — never store raw. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
