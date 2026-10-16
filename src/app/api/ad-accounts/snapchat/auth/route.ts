import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * POST /api/ad-accounts/snapchat/auth
 *
 * Initiates the Snapchat Marketing API OAuth 2.0 flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
 *
 * Snapchat Marketing API OAuth docs:
 * https://developers.snapchat.com/api/marketing-api/auth-and-authentication
 *
 * Classic authorization_code flow with client_id + client_secret.
 * We embed teamId in the state param so the callback can recover it
 * without a session.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({
      oauthUrl: null,
      message: "Snapchat OAuth not configured. Set SNAPCHAT_CLIENT_ID in .env.local.",
    });
  }

  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "No team associated with account" },
      { status: 400 }
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/snapchat/callback`;

  // CSRF-safe state: one-time nonce in an HttpOnly cookie, verified by the callback
  const nonce = await issueOAuthNonce("snapchat_oauth_nonce");
  const state = encodeOAuthState({ teamId }, nonce);

  // Snapchat OAuth 2.0 authorization endpoint
  // Scope snapchat-marketing-api grants read access to ad accounts and stats
  const oauthUrl =
    `https://accounts.snapchat.com/login/oauth2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("snapchat-marketing-api")}` +
    `&state=${state}`;

  return NextResponse.json({ oauthUrl });
}
