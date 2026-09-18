import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import type { IAdAccount } from "@/models/AdAccount";

/**
 * Returns a valid TikTok access token for the given AdAccount.
 *
 * If the stored token is expired (or within 60 s of expiry), it will
 * automatically be refreshed using the refresh_token and the result
 * persisted back to MongoDB before returning the new access token.
 *
 * Throws TikTokTokenError if:
 *  - The access token is missing / unreadable.
 *  - The token is expired AND no refresh token is available.
 *  - The TikTok refresh endpoint returns an error.
 *
 * TikTok token refresh docs:
 *  https://business-api.tiktok.com/portal/docs?id=1738373141733378
 */
export async function getValidTikTokToken(
  adAccount: IAdAccount
): Promise<string> {
  const now       = Date.now();
  const expiresAt = adAccount.tokenExpiresAt?.getTime() ?? Infinity;
  const isExpired = expiresAt - now < 60_000; // treat as expired if < 1 min left

  const accessToken = safeDecrypt(adAccount.accessToken);

  if (!isExpired && accessToken) {
    return accessToken;
  }

  // ── Token is expired — attempt refresh ───────────────────────────────────
  const refreshToken = safeDecrypt(adAccount.refreshToken);

  if (!refreshToken) {
    throw new TikTokTokenError(
      "TikTok access token expired and no refresh token is available. " +
        "The user must reconnect their TikTok Ads account.",
      "NO_REFRESH_TOKEN"
    );
  }

  const appId     = process.env.TIKTOK_APP_ID!;
  const appSecret = process.env.TIKTOK_APP_SECRET!;

  const res = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/",
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        app_id:        appId,
        secret:        appSecret,
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new TikTokTokenError(
      `TikTok token refresh failed (HTTP ${res.status}): ${text}`,
      "REFRESH_FAILED"
    );
  }

  const body: {
    code?:    number;
    message?: string;
    data?: {
      access_token?:              string;
      refresh_token?:             string;
      expires_in?:                number;
      refresh_token_expires_in?:  number;
    };
  } = await res.json();

  if (body.code !== 0 || !body.data?.access_token) {
    throw new TikTokTokenError(
      `TikTok token refresh returned error: ${body.message ?? "unknown"}`,
      "REFRESH_FAILED"
    );
  }

  const newAccessToken  = body.data.access_token;
  const newRefreshToken = body.data.refresh_token;
  const newExpiresIn    = body.data.expires_in;

  const tokenExpiresAt = newExpiresIn
    ? new Date(now + newExpiresIn * 1000)
    : undefined;

  // ── Persist refreshed tokens back to the DB ───────────────────────────────
  await connectDB();
  await AdAccountModel.findByIdAndUpdate(adAccount._id, {
    accessToken:  encrypt(newAccessToken),
    // TikTok may rotate the refresh token — always update if provided
    refreshToken: newRefreshToken ? encrypt(newRefreshToken) : adAccount.refreshToken,
    tokenExpiresAt,
    $unset: { syncError: "" },
  });

  return newAccessToken;
}

// ── Typed error ───────────────────────────────────────────────────────────────

export type TikTokTokenErrorCode =
  | "NO_REFRESH_TOKEN"
  | "REFRESH_FAILED";

export class TikTokTokenError extends Error {
  constructor(
    message: string,
    public readonly code: TikTokTokenErrorCode
  ) {
    super(message);
    this.name = "TikTokTokenError";
  }
}
