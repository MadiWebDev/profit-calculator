import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * POST /api/ad-accounts/google/auth
 *
 * Initiates the Google Ads API OAuth 2.0 flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
 *
 * Google OAuth 2.0 docs:
 * https://developers.google.com/identity/protocols/oauth2/web-server
 *
 * We request offline access (refresh token) with the adwords scope so the
 * server can pull campaign reporting without the user present. The refresh
 * token is stored encrypted on the AdAccount document.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({
      oauthUrl: null,
      message: "Google Ads OAuth not configured. Set GOOGLE_ADS_CLIENT_ID in .env.local.",
    });
  }

  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "No team associated with account" },
      { status: 400 }
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/google/callback`;

  // CSRF-safe state: one-time nonce in an HttpOnly cookie, verified by the callback
  const nonce = await issueOAuthNonce("google_oauth_nonce");
  const state = encodeOAuthState({ teamId }, nonce);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.json({
    oauthUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
}
