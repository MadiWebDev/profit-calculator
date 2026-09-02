import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";

/**
 * POST /api/stores/etsy/auth
 *
 * Initiates the Etsy OAuth 2.0 PKCE flow.
 * Returns { oauthUrl } which the client should redirect the browser to.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.ETSY_CLIENT_ID;
  if (!clientId) {
    // Dev stub — Etsy credentials not yet configured
    return NextResponse.json({
      oauthUrl: null,
      message: "Etsy OAuth not configured. Set ETSY_CLIENT_ID in .env.local.",
    });
  }

  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team associated with account" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectUri = `${siteUrl}/api/stores/etsy/callback`;

  // ── PKCE ────────────────────────────────────────────────────────────────
  // code_verifier: 43–128 URL-safe chars
  const codeVerifier = crypto.randomBytes(64).toString("base64url");
  // code_challenge = BASE64URL(SHA256(codeVerifier))
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Encode teamId + codeVerifier in state so the callback can retrieve them
  const state = Buffer.from(
    JSON.stringify({ teamId, codeVerifier })
  ).toString("base64url");

  const scopes = [
    "transactions_r",   // read orders
    "listings_r",       // read listings / products
    "profile_r",        // read shop profile (name, shop ID)
  ].join("%20");

  const oauthUrl =
    `https://www.etsy.com/oauth/connect` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scopes}` +
    `&state=${state}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  return NextResponse.json({ oauthUrl });
}
