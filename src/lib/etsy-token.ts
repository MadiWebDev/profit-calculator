import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import type { IStore } from "@/models/Store";

/**
 * Returns a valid Etsy access token for the given store.
 *
 * If the stored token is expired (or within 60 seconds of expiry), it will
 * automatically be refreshed using the refresh_token and the result persisted
 * back to MongoDB before returning the new access token.
 *
 * Throws if:
 *  - The access token is missing or unreadable.
 *  - The token is expired AND no refresh token is available.
 *  - The Etsy refresh endpoint returns an error.
 */
export async function getValidEtsyToken(store: IStore): Promise<string> {
  // ── Check if token is still fresh (with 60 s buffer) ─────────────────────
  const now         = Date.now();
  const expiresAt   = store.tokenExpiresAt?.getTime() ?? Infinity;
  const isExpired   = expiresAt - now < 60_000; // treat as expired if < 1 min left

  const accessToken = safeDecrypt(store.accessToken);

  if (!isExpired && accessToken) {
    return accessToken;
  }

  // ── Token is expired — attempt refresh ───────────────────────────────────
  const refreshToken = safeDecrypt(store.refreshToken);

  if (!refreshToken) {
    throw new EtsyTokenError(
      "Access token expired and no refresh token is available. " +
        "The user must reconnect their Etsy store.",
      "NO_REFRESH_TOKEN"
    );
  }

  const clientId     = process.env.ETSY_CLIENT_ID!;
  const clientSecret = process.env.ETSY_CLIENT_SECRET;

  const body: Record<string, string> = {
    grant_type:    "refresh_token",
    client_id:     clientId,
    refresh_token: refreshToken,
  };
  if (clientSecret) body.client_secret = clientSecret;

  const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new EtsyTokenError(
      `Etsy token refresh failed (HTTP ${res.status}): ${text}`,
      "REFRESH_FAILED"
    );
  }

  const data: {
    access_token:  string;
    refresh_token?: string;
    expires_in?:   number;
  } = await res.json();

  if (!data.access_token) {
    throw new EtsyTokenError(
      "Etsy token refresh response did not include an access_token.",
      "REFRESH_FAILED"
    );
  }

  // ── Persist refreshed tokens back to the DB ───────────────────────────────
  const tokenExpiresAt = data.expires_in
    ? new Date(now + data.expires_in * 1000)
    : undefined;

  await connectDB();
  await StoreModel.findByIdAndUpdate(store._id, {
    accessToken:  encrypt(data.access_token),
    // Etsy rotates the refresh token on each refresh — always update it
    refreshToken: data.refresh_token ? encrypt(data.refresh_token) : store.refreshToken,
    tokenExpiresAt,
    // Clear any previous token-related sync error
    $unset: { syncError: "" },
  });

  return data.access_token;
}

// ─── Typed error ──────────────────────────────────────────────────────────────

export type EtsyTokenErrorCode =
  | "NO_REFRESH_TOKEN"
  | "REFRESH_FAILED";

export class EtsyTokenError extends Error {
  constructor(
    message: string,
    public readonly code: EtsyTokenErrorCode,
  ) {
    super(message);
    this.name = "EtsyTokenError";
  }
}
