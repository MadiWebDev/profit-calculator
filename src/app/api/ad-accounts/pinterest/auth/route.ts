import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function buildPinterestAuthUrl(teamId: string): Promise<string> {
  const appId = process.env.PINTEREST_APP_ID;
  if (!appId) {
    throw new Error("PINTEREST_APP_ID is not configured");
  }

  const redirectUri = process.env.PINTEREST_REDIRECT_URI || `${SITE_URL}/api/ad-accounts/pinterest/callback`;

  // CSRF-safe state: one-time nonce in an HttpOnly cookie, verified by the callback
  const nonce = await issueOAuthNonce("pinterest_oauth_nonce");
  const state = encodeOAuthState({ teamId }, nonce);

  // Pinterest OAuth authorization endpoint
  // Scope ads:read — read ad accounts and reporting data
  return (
    `https://www.pinterest.com/oauth/` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("ads:read")}` +
    `&state=${state}`
  );
}

/**
 * GET /api/ad-accounts/pinterest/auth
 * Direct browser redirect support.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/auth/login", SITE_URL));
  }

  const appId = process.env.PINTEREST_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=pinterest_not_configured", SITE_URL)
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
    const authUrl = await buildPinterestAuthUrl(teamId);
    return NextResponse.redirect(authUrl);
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=pinterest_auth_error", SITE_URL)
    );
  }
}

/**
 * POST /api/ad-accounts/pinterest/auth
 *
 * Initiates the Pinterest API v5 OAuth 2.0 flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
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
    const oauthUrl = await buildPinterestAuthUrl(teamId);
    return NextResponse.json({ oauthUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate Pinterest OAuth" },
      { status: 500 }
    );
  }
}
