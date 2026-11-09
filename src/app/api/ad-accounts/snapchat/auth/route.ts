import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function buildSnapchatAuthUrl(teamId: string): Promise<string> {
  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  if (!clientId) {
    throw new Error("SNAPCHAT_CLIENT_ID is not configured");
  }

  const redirectUri = process.env.SNAPCHAT_REDIRECT_URI || `${SITE_URL}/api/ad-accounts/snapchat/callback`;

  // CSRF-safe state: one-time nonce in an HttpOnly cookie, verified by the callback
  const nonce = await issueOAuthNonce("snapchat_oauth_nonce");
  const state = encodeOAuthState({ teamId }, nonce);

  // Snapchat OAuth 2.0 authorization endpoint
  // Scope snapchat-marketing-api grants read access to ad accounts and stats
  return (
    `https://accounts.snapchat.com/login/oauth2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("snapchat-marketing-api")}` +
    `&state=${state}`
  );
}

/**
 * GET /api/ad-accounts/snapchat/auth
 * Direct browser redirect support.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/auth/login", SITE_URL));
  }

  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=snapchat_not_configured", SITE_URL)
    );
  }

  const teamId = (session.user as { teamId?: string }).teamId ?? session.user.id;

  const { checkEntitlement } = await import("@/lib/entitlements");
  const ent = await checkEntitlement(teamId, "adplatforms.connect");
  if ("response" in ent) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=plan_limit", SITE_URL)
    );
  }

  try {
    const authUrl = await buildSnapchatAuthUrl(teamId);
    return NextResponse.redirect(authUrl);
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=snapchat_auth_error", SITE_URL)
    );
  }
}

/**
 * POST /api/ad-accounts/snapchat/auth
 *
 * Initiates the Snapchat Marketing API OAuth 2.0 flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
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

  const teamId = (session.user as { teamId?: string }).teamId ?? session.user.id;
  if (!teamId) {
    return NextResponse.json(
      { error: "No team associated with account" },
      { status: 400 }
    );
  }

  const { checkEntitlement } = await import("@/lib/entitlements");
  const ent = await checkEntitlement(teamId, "adplatforms.connect");
  if ("response" in ent) {
    return NextResponse.json({
      oauthUrl: null,
      message: "Ad platform limit reached for your plan. Please upgrade to connect more ad platforms.",
    });
  }

  try {
    const oauthUrl = await buildSnapchatAuthUrl(teamId);
    return NextResponse.json({ oauthUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate Snapchat OAuth" },
      { status: 500 }
    );
  }
}
