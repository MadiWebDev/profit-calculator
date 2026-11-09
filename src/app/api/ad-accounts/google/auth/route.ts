import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function buildGoogleAuthUrl(teamId: string): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_ADS_CLIENT_ID is not configured");
  }

  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI || `${SITE_URL}/api/ad-accounts/google/callback`;

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

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * GET /api/ad-accounts/google/auth
 * Direct browser redirect support.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/auth/login", SITE_URL));
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=google_not_configured", SITE_URL)
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
    const authUrl = await buildGoogleAuthUrl(teamId);
    return NextResponse.redirect(authUrl);
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=google_auth_error", SITE_URL)
    );
  }
}

/**
 * POST /api/ad-accounts/google/auth
 *
 * Initiates the Google Ads API OAuth 2.0 flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
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
    const oauthUrl = await buildGoogleAuthUrl(teamId);
    return NextResponse.json({ oauthUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate Google Ads OAuth" },
      { status: 500 }
    );
  }
}
