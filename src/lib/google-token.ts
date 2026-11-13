import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import type { IAdAccount } from "@/models/AdAccount";

/**
 * Google Ads access-token refresh (FINAL-REPORT F1).
 *
 * The OAuth callback stores the refresh token (`access_type=offline`
 * + `prompt=consent`), but until this module existed nothing ever
 * used it — every sync died ~1h after connect when the short-lived
 * access token expired. Modelled on `getValidTikTokToken`
 * (`src/lib/tiktok-token.ts`): refresh when expired or <60s from
 * expiry, persist rotated tokens, throw a typed error otherwise.
 *
 * Google token refresh docs:
 * https://developers.google.com/identity/protocols/oauth2/web-server#offline
 */
export async function getValidGoogleToken(
  adAccount: IAdAccount
): Promise<string> {
  const now = Date.now();
  const expiresAt = adAccount.tokenExpiresAt?.getTime() ?? Infinity;
  const isExpired = expiresAt - now < 60_000; // treat as expired if < 1 min left

  const accessToken = safeDecrypt(adAccount.accessToken);

  if (!isExpired && accessToken) {
    return accessToken;
  }

  // ── Token is expired — attempt refresh ───────────────────────────────────
  const refreshToken = safeDecrypt(adAccount.refreshToken);

  if (!refreshToken) {
    throw new GoogleTokenError(
      "Google Ads access token expired and no refresh token is available. " +
        "The user must reconnect their Google Ads account.",
      "NO_REFRESH_TOKEN"
    );
  }

  const refreshed = await refreshGoogleAccessToken(refreshToken);

  // ── Persist refreshed tokens back to the DB ───────────────────────────────
  await connectDB();
  await AdAccountModel.findByIdAndUpdate(adAccount._id, {
    accessToken: encrypt(refreshed.accessToken),
    // Google refresh tokens do not normally rotate, but persist a new
    // one if the endpoint ever returns one.
    refreshToken: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : adAccount.refreshToken,
    tokenExpiresAt: refreshed.expiresIn
      ? new Date(now + refreshed.expiresIn * 1000)
      : undefined,
    $unset: { syncError: "" },
  });

  return refreshed.accessToken;
}

export interface GoogleRefreshedTokens {
  accessToken: string;
  /** Present only if Google rotated the refresh token. */
  refreshToken?: string;
  /** Access-token lifetime in seconds. */
  expiresIn?: number;
}

/**
 * Exchange a Google refresh token for a fresh access token.
 * Pure HTTP — no DB access, so it is unit-testable with a mocked fetch.
 * Throws GoogleTokenError on any failure.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<GoogleRefreshedTokens> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleTokenError(
      "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET are not configured",
      "REFRESH_FAILED"
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new GoogleTokenError(
      `Google token refresh failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
      "REFRESH_FAILED"
    );
  }

  const body: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = await res.json();

  if (body.error || !body.access_token) {
    throw new GoogleTokenError(
      `Google token refresh returned error: ${body.error_description ?? body.error ?? "unknown"}`,
      "REFRESH_FAILED"
    );
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
  };
}

// ── Typed error ───────────────────────────────────────────────────────────────

export type GoogleTokenErrorCode = "NO_REFRESH_TOKEN" | "REFRESH_FAILED";

export class GoogleTokenError extends Error {
  constructor(
    message: string,
    public readonly code: GoogleTokenErrorCode
  ) {
    super(message);
    this.name = "GoogleTokenError";
  }
}
