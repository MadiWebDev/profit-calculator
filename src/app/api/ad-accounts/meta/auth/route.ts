import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Build Meta OAuth authorization URL
 */
async function buildMetaAuthUrl(teamId: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    throw new Error("META_APP_ID is not configured");
  }

  // CSRF-safe state: one-time nonce in an HttpOnly cookie, verified by the callback
  const nonce = await issueOAuthNonce("meta_oauth_nonce");
  const state = encodeOAuthState({ teamId }, nonce);

  const redirectUri = process.env.META_REDIRECT_URI || `${SITE_URL}/api/ad-accounts/meta/callback`;

  const params = new URLSearchParams({
    client_id:     appId,
    redirect_uri:  redirectUri,
    state,
    scope: [
      "ads_read",
      "ads_management",
      "business_management",
      "read_insights",
    ].join(","),
    response_type: "code",
  });

  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

/**
 * GET /api/ad-accounts/meta/auth
 *
 * Direct browser redirect support.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/auth/login", SITE_URL));
  }

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=meta_not_configured", SITE_URL)
    );
  }

  const teamId = (session.user as { teamId?: string }).teamId ?? session.user.id;

  const { checkEntitlement } = await import("@/lib/entitlements");
  const ent = await checkEntitlement(teamId, "adplatforms.connect");
  if ("response" in ent) {
    return NextResponse.redirect(new URL("/dashboard/settings?tab=ad-accounts&error=plan_limit", SITE_URL));
  }

  try {
    const authUrl = await buildMetaAuthUrl(teamId);
    return NextResponse.redirect(authUrl);
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=ad-accounts&error=meta_auth_error", SITE_URL)
    );
  }
}

/**
 * POST /api/ad-accounts/meta/auth
 *
 * Client JSON API support called by SettingsClient: returns { oauthUrl }.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({
      oauthUrl: null,
      message: "Meta OAuth not configured. Set META_APP_ID in .env.local.",
    });
  }

  const teamId = (session.user as { teamId?: string }).teamId ?? session.user.id;
  if (!teamId) {
    return NextResponse.json({ error: "No team associated with account" }, { status: 400 });
  }

  // Plan limit: ad platforms
  const { checkEntitlement } = await import("@/lib/entitlements");
  const ent = await checkEntitlement(teamId, "adplatforms.connect");
  if ("response" in ent) {
    return NextResponse.json({
      oauthUrl: null,
      message: "Ad platform limit reached for your plan. Please upgrade to connect more ad platforms.",
    });
  }

  try {
    const oauthUrl = await buildMetaAuthUrl(teamId);
    return NextResponse.json({ oauthUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate Meta OAuth" },
      { status: 500 }
    );
  }
}
