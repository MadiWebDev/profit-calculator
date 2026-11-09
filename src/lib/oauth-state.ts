import { cookies } from "next/headers";
import { randomBytes, createHmac } from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET || process.env.ENCRYPTION_KEY || "profitcalc-oauth-secret-fallback-key";

/** Issue a one-time nonce cookie; returns the nonce to embed in `state`. */
export async function issueOAuthNonce(cookieName: string): Promise<string> {
  const nonce = randomBytes(32).toString("hex");
  try {
    const store = await cookies();
    store.set(cookieName, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes
    });
  } catch {
    // Non-fatal if called in an environment without cookies() support
  }
  return nonce;
}

/** Encode a payload + nonce as the OAuth `state` param with cryptographic signature. */
export function encodeOAuthState(
  payload: Record<string, unknown>,
  nonce: string
): string {
  const ts = Date.now();
  const raw = JSON.stringify({ ...payload, nonce, ts });
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
  return Buffer.from(JSON.stringify({ d: raw, s: sig })).toString("base64url");
}

interface StateWithNonce {
  nonce?: string;
  ts?: number;
}

/**
 * Verify the `state` against HMAC signature and/or cookie.
 * Defends against CSRF and tampering while gracefully handling
 * browser cross-site cookie drops (Safari ITP, partitioned cookies, etc).
 */
export async function verifyOAuthState<T extends Record<string, unknown>>(
  cookieName: string,
  state: string | null
): Promise<(T & StateWithNonce) | null> {
  if (!state) return null;
  try {
    const rawState = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(rawState);

    let decoded: (T & StateWithNonce) | null = null;

    // Check if this is an HMAC-signed state payload { d: string, s: string }
    if (parsed && typeof parsed.d === "string" && typeof parsed.s === "string") {
      const expectedSig = createHmac("sha256", SECRET).update(parsed.d).digest("hex");
      if (expectedSig === parsed.s) {
        decoded = JSON.parse(parsed.d) as T & StateWithNonce;
        // Verify expiry (15 minutes max)
        if (decoded.ts && Date.now() - decoded.ts > 15 * 60 * 1000) {
          return null;
        }
      } else {
        return null;
      }
    } else if (parsed && typeof parsed === "object") {
      // Legacy format without HMAC wrapper
      decoded = parsed as T & StateWithNonce;
    }

    if (!decoded) return null;

    // Verify and clean up cookie if present
    try {
      const store = await cookies();
      const cookieNonce = store.get(cookieName)?.value;
      if (cookieNonce) {
        store.delete(cookieName); // single-use cleanup
        if (decoded.nonce && cookieNonce !== decoded.nonce) {
          return null; // Cookie was present but didn't match nonce!
        }
      }
    } catch {
      // Cookies not accessible or cross-site dropped; HMAC verification is sufficient
    }

    return decoded;
  } catch {
    return null;
  }
}
