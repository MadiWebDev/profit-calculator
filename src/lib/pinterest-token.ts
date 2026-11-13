import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import type { IAdAccount } from "@/models/AdAccount";

/**
 * Pinterest API v5 access-token refresh (FINAL-REPORT F3).
 *
 * The OAuth callback stored only the access token; once it expired
 * (30 days) every sync failed until the user reconnected. Pinterest
 * DOES issue a refresh token (`refresh_token`, `pinr_…`) on the
 * authorization-code exchange, with a 60-day continuous window that
 * renews on every refresh — and every refresh ROTATES the refresh
 * token, so the new one must always be persisted (reusing the old one
 * fails). Modelled on `getValidTikTokToken`
 * (`src/lib/tiktok-token.ts`): refresh when expired or <60s from
 * expiry, persist rotated tokens, throw a typed error otherwise.
 *
 * Pinterest token docs:
 * https://developers.pinterest.com/docs/getting-started/authentication/
 */
export async function getValidPinterestToken(
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
    throw new PinterestTokenError(
      "Pinterest access token expired and no refresh token is available. " +
        "The user must reconnect their Pinterest Ads account.",
      "NO_REFRESH_TOKEN"
    );
  }

  const refreshed = await refreshPinterestAccessToken(refreshToken);

  // ── Persist refreshed tokens back to the DB ───────────────────────────────
  // Pinterest rotates the refresh token on EVERY refresh — the old one
  // is spent immediately, so persisting the new one is not optional.
  await connectDB();
  await AdAccountModel.findByIdAndUpdate(adAccount._id, {
    accessToken: encrypt(refreshed.accessToken),
    refreshToken: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : adAccount.refreshToken,
    tokenExpiresAt: refreshed.expiresIn
      ? new Date(now + refreshed.expiresIn * 1000)
      : undefined,
    $unset: { syncError: "" },
  });

  return refreshed.accessToken;
}

export interface PinterestRefreshedTokens {
  accessToken: string;
  /** Pinterest returns a new refresh token on every refresh. */
  refreshToken?: string;
  /** Access-token lifetime in seconds (30 days). */
  expiresIn?: number;
}

/**
 * Exchange a Pinterest refresh token for a fresh access token.
 * Pure HTTP — no DB access, so it is unit-testable with a mocked fetch.
 * Throws PinterestTokenError on any failure.
 */
export async function refreshPinterestAccessToken(
  refreshToken: string
): Promise<PinterestRefreshedTokens> {
  const appId = process.env.PINTEREST_APP_ID;
  const appSecret = process.env.PINTEREST_APP_SECRET;
  if (!appId || !appSecret) {
    throw new PinterestTokenError(
      "PINTEREST_APP_ID / PINTEREST_APP_SECRET are not configured",
      "REFRESH_FAILED"
    );
  }

  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      // Apps created before 2025-09-25 need this flag to opt into the
      // continuous (60-day, rotating) refresh token; newer apps get it
      // automatically and ignore the flag.
      continuous_refresh: "true",
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new PinterestTokenError(
      `Pinterest token refresh failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
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
    throw new PinterestTokenError(
      `Pinterest token refresh returned error: ${body.error_description ?? body.error ?? "unknown"}`,
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

export type PinterestTokenErrorCode = "NO_REFRESH_TOKEN" | "REFRESH_FAILED";

export class PinterestTokenError extends Error {
  constructor(
    message: string,
    public readonly code: PinterestTokenErrorCode
  ) {
    super(message);
    this.name = "PinterestTokenError";
  }
}
