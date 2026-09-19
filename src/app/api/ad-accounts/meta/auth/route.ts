import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

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
export async function GET(req: NextRequest) {
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
  const state = Buffer.from(JSON.stringify({ teamId })).toString("base64url");

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
