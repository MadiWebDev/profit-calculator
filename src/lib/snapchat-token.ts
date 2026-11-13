import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import type { IAdAccount } from "@/models/AdAccount";

/**
 * Snapchat Marketing API access-token refresh (FINAL-REPORT F2d).
 *
 * Finding: Snapchat DOES issue a refresh token — the authorization-code
 * exchange returns `access_token` (3600s) + `refresh_token`, and the
 * refresh token is long-lived: it does not rotate and has no documented
 * expiry (it only stops working if the user revokes access, is removed
 * from the organization, or the client secret is regenerated). The old
 * code simply never asked for it, so every Snapchat sync died 1h after
 * connect. Modelled on `getValidTikTokToken`
 * (`src/lib/tiktok-token.ts`): refresh when expired or <60s from
 * expiry, persist rotated tokens, throw a typed error otherwise.
 *
 * Accounts connected BEFORE this fix have no stored refresh token;
 * their first post-expiry sync fails with NO_REFRESH_TOKEN and a clear
 * reconnect message — there is no way to mint a refresh token without
 * the user re-running the OAuth flow.
 *
 * Snapchat token refresh docs:
 * https://developers.snap.com/marketing-api/Ads-API/quick-start
 */
export async function getValidSnapchatToken(
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
    throw new SnapchatTokenError(
      "Snapchat access token expired and no refresh token is available. " +
        "The user must reconnect their Snapchat Ads account.",
      "NO_REFRESH_TOKEN"
    );
  }

  const refreshed = await refreshSnapchatAccessToken(refreshToken);

  // ── Persist refreshed tokens back to the DB ───────────────────────────────
  await connectDB();
  await AdAccountModel.findByIdAndUpdate(adAccount._id, {
    accessToken: encrypt(refreshed.accessToken),
    // Snapchat does not rotate the refresh token, but persist a new
    // one if the endpoint ever returns one.
    refreshToken: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : adAccount.refreshToken,
    tokenExpiresAt: refreshed.expiresIn
      ? new Date(now + refreshed.expiresIn * 1000)
      : undefined,
    $unset: { syncError: "" },
  });

  return refreshed.accessToken;
}

export interface SnapchatRefreshedTokens {
  accessToken: string;
  /** Snapchat does not normally rotate the refresh token. */
  refreshToken?: string;
  /** Access-token lifetime in seconds (3600). */
  expiresIn?: number;
}

/**
 * Exchange a Snapchat refresh token for a fresh access token.
 * Pure HTTP — no DB access, so it is unit-testable with a mocked fetch.
 * Throws SnapchatTokenError on any failure.
 */
export async function refreshSnapchatAccessToken(
  refreshToken: string
): Promise<SnapchatRefreshedTokens> {
  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SnapchatTokenError(
      "SNAPCHAT_CLIENT_ID / SNAPCHAT_CLIENT_SECRET are not configured",
      "REFRESH_FAILED"
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new SnapchatTokenError(
      `Snapchat token refresh failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
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
    throw new SnapchatTokenError(
      `Snapchat token refresh returned error: ${body.error_description ?? body.error ?? "unknown"}`,
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

export type SnapchatTokenErrorCode = "NO_REFRESH_TOKEN" | "REFRESH_FAILED";

export class SnapchatTokenError extends Error {
  constructor(
    message: string,
    public readonly code: SnapchatTokenErrorCode
  ) {
    super(message);
    this.name = "SnapchatTokenError";
  }
}
