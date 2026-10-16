import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { issueOAuthNonce, encodeOAuthState } from "@/lib/oauth-state";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * GET /api/ad-accounts/meta/auth
 *
 * Initiates the Meta / Facebook Marketing API OAuth flow.
 * Builds the Facebook authorization URL and redirects the user there.
 *
 * Meta OAuth docs:
 *  https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/auth/signin", SITE_URL));
  }

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=meta_not_configured", SITE_URL)
    );
  }

  // Encode teamId in state so we can recover it in the callback
  // (the browser redirect from Meta may not carry the session cookie)
  const teamId = (session.user as { teamId?: string }).teamId ?? session.user.id;

  // Plan limit: ad platforms (checked again in the callback against the DB)
  const { checkEntitlement } = await import("@/lib/entitlements");
  const ent = await checkEntitlement(teamId, "adplatforms.connect");
  if ("response" in ent) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=plan_limit", SITE_URL));
  }

  // CSRF-safe state: one-time nonce in an HttpOnly cookie, verified by the callback
  const nonce = await issueOAuthNonce("meta_oauth_nonce");
  const state = encodeOAuthState({ teamId }, nonce);

  const redirectUri = `${SITE_URL}/api/ad-accounts/meta/callback`;

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

  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
