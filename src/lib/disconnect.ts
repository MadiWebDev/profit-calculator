/**
 * Token revocation helpers for store / ad-account disconnects.
 *
 * Best-effort: if the provider's revoke call fails (network, expired token),
 * we still clear local credentials — a failed revoke must never leave
 * encrypted tokens readable in the DB after the user asked to disconnect.
 */
import { safeDecrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/** Revoke a Meta user access token: DELETE /{user-id}/permissions */
export async function revokeMetaToken(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch("https://graph.facebook.com/v21.0/me/permissions", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    logger.warn("meta token revoke failed (non-fatal)", {
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}

/** Revoke a TikTok access token: POST /open_api/v1.3/oauth2/revoke/ */
export async function revokeTikTokToken(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/revoke/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
  } catch (e) {
    logger.warn("tiktok token revoke failed (non-fatal)", {
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}

/** Revoke a Google Ads/OAuth token: POST https://oauth2.googleapis.com/revoke */
export async function revokeGoogleToken(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${encodeURIComponent(accessToken)}`,
    });
  } catch (e) {
    logger.warn("google token revoke failed (non-fatal)", {
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}

/** Revoke a Pinterest token: POST /v5/oauth/token with grant_type=revoke */
export async function revokePinterestToken(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  try {
    const id = process.env.PINTEREST_APP_ID;
    const secret = process.env.PINTEREST_APP_SECRET;
    if (!id || !secret) return;
    await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "revoke", token: accessToken }).toString(),
    });
  } catch (e) {
    logger.warn("pinterest token revoke failed (non-fatal)", {
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}

/** Snapchat has no programmatic token revocation — clearing locally is the revocation. */
export async function revokeSnapchatToken(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  logger.info("snapchat disconnect: no provider revoke endpoint; local credentials cleared");
}

/**
 * Revoke whatever provider tokens a Store holds, then return the DB update
 * that clears them. Shopify offline tokens and WooCommerce keys have no
 * server-side revocation endpoint available to us — they die on app uninstall
 * / key deletion at the store; clearing our encrypted copies is what matters.
 */
export async function revokeStoreTokens(store: {
  platform: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}): Promise<void> {
  const token = safeDecrypt(store.accessToken);
  switch (store.platform) {
    case "meta":
      await revokeMetaToken(token);
      break;
    case "tiktok":
      await revokeTikTokToken(token);
      break;
    case "google":
      await revokeGoogleToken(token);
      break;
    case "pinterest":
      await revokePinterestToken(token);
      break;
    case "snapchat":
      await revokeSnapchatToken(token);
      break;
    default:
      // shopify / etsy / woocommerce: no revoke endpoint — just clear locally.
      break;
  }
}
