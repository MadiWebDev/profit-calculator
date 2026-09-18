import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * POST /api/ad-accounts/tiktok/auth
 *
 * Initiates the TikTok Marketing API OAuth 2.0 flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
 *
 * TikTok Marketing API OAuth docs:
 *  https://business-api.tiktok.com/portal/docs?id=1738373164380162
 *
 * Unlike Etsy (PKCE), TikTok uses a classic authorization_code flow
 * with app_id + secret. We embed teamId in the state param so the
 * callback can recover it without a session.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.TIKTOK_APP_ID;
  if (!appId) {
    return NextResponse.json({
      oauthUrl: null,
      message: "TikTok OAuth not configured. Set TIKTOK_APP_ID in .env.local.",
    });
  }

  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "No team associated with account" },
      { status: 400 }
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/tiktok/callback`;

  // Encode teamId + a random nonce in state to prevent CSRF
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(
    JSON.stringify({ teamId, nonce })
  ).toString("base64url");

  // TikTok Marketing API authorization endpoint
  // Scopes: ad_account — manage ad accounts; report — read reporting data
  const oauthUrl =
    `https://business-api.tiktok.com/portal/auth` +
    `?app_id=${encodeURIComponent(appId)}` +
    `&state=${state}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=ad_account%2Creport`;

  return NextResponse.json({ oauthUrl });
}
