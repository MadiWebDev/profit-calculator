import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * POST /api/ad-accounts/pinterest/auth
 *
 * Initiates the Pinterest API v5 OAuth 2.0 flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
 *
 * Pinterest OAuth docs:
 *  https://developers.pinterest.com/docs/getting-started/authentication/
 *
 * Classic authorization_code flow. We embed teamId in the state param so
 * the callback can recover it without a session.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.PINTEREST_APP_ID;
  if (!appId) {
    return NextResponse.json({
      oauthUrl: null,
      message: "Pinterest OAuth not configured. Set PINTEREST_APP_ID in .env.local.",
    });
  }

  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "No team associated with account" },
      { status: 400 }
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/pinterest/callback`;

  // CSRF-safe state: one-time nonce in an HttpOnly cookie, verified by the callback
  const nonce = await issueOAuthNonce("pinterest_oauth_nonce");
  const state = encodeOAuthState({ teamId }, nonce);

  // Pinterest OAuth authorization endpoint
  // Scope ads:read — read ad accounts and reporting data
  const oauthUrl =
    `https://www.pinterest.com/oauth/` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("ads:read")}` +
    `&state=${state}`;

  return NextResponse.json({ oauthUrl });
}
