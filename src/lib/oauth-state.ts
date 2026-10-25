/**
 * OAuth `state` CSRF protection — one-time nonce pattern.
 *
 * The auth-init route issues a cryptographically random nonce, stores it in
 * an HttpOnly cookie, and embeds it in the `state` param sent to the provider.
 * The callback verifies the state nonce matches the cookie, then deletes the
 * cookie (single-use). This defeats OAuth login-CSRF / account-linking attacks
 * where an attacker tricks a victim into completing the attacker's OAuth flow.
 *
 * Usage (auth route):
 *   const nonce = await issueOAuthNonce("shopify_oauth_nonce");
 *   const state = encodeOAuthState({ teamId }, nonce);
 *
 * Usage (callback route):
 *   const data = await verifyOAuthState<{ teamId: string }>("shopify_oauth_nonce", state);
 *   if (!data) return redirect("/onboarding?error=csrf_mismatch");
 */
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

/** Issue a one-time nonce cookie; returns the nonce to embed in `state`. */
export async function issueOAuthNonce(cookieName: string): Promise<string> {
  const nonce = randomBytes(32).toString("hex");
  const store = await cookies();
  store.set(cookieName, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes — plenty for an OAuth round-trip
  });
  return nonce;
}

/** Encode a payload + nonce as the OAuth `state` param. */
export function encodeOAuthState(
  payload: Record<string, unknown>,
  nonce: string
): string {
  return Buffer.from(JSON.stringify({ ...payload, nonce })).toString("base64url");
}

interface StateWithNonce {
  nonce?: string;
}

/**
 * Verify the `state` nonce against the cookie. Single-use: the cookie is
 * deleted. Returns the decoded payload, or null when invalid/tampered.
 */
export async function verifyOAuthState<T extends Record<string, unknown>>(
  cookieName: string,
  state: string | null
): Promise<(T & StateWithNonce) | null> {
  if (!state) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString()
    ) as T & StateWithNonce;

    const store = await cookies();
    const cookieNonce = store.get(cookieName)?.value;
    store.delete(cookieName); // one-time use

    if (!cookieNonce || !decoded.nonce || cookieNonce !== decoded.nonce) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
