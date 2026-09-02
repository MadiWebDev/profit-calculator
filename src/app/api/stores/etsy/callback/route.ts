import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { encrypt } from "@/lib/encryption";

/**
 * GET /api/stores/etsy/callback
 *
 * Etsy redirects here after the user grants (or denies) access.
 * Exchanges the authorization code for tokens using PKCE, fetches
 * the shop info, and upserts the store record in MongoDB.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectUri = `${siteUrl}/api/stores/etsy/callback`;

  // User denied access or Etsy returned an error
  if (error) {
    return NextResponse.redirect(
      new URL(`/onboarding?error=${encodeURIComponent(error)}`, siteUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/onboarding?error=invalid_callback", siteUrl)
    );
  }

  // ── Decode state ────────────────────────────────────────────────────────
  let teamId: string;
  let codeVerifier: string;
  try {
    const decoded   = JSON.parse(Buffer.from(state, "base64url").toString());
    teamId          = decoded.teamId;
    codeVerifier    = decoded.codeVerifier;
    if (!teamId || !codeVerifier) throw new Error("Missing fields");
  } catch {
    return NextResponse.redirect(
      new URL("/onboarding?error=invalid_state", siteUrl)
    );
  }

  const clientId     = process.env.ETSY_CLIENT_ID!;
  const clientSecret = process.env.ETSY_CLIENT_SECRET; // optional for PKCE

  // ── Exchange code for tokens ─────────────────────────────────────────────
  const tokenBody: Record<string, string> = {
    grant_type:    "authorization_code",
    client_id:     clientId,
    redirect_uri:  redirectUri,
    code,
    code_verifier: codeVerifier,
  };

  // Etsy accepts client_secret in the body when present (public clients omit it)
  if (clientSecret) tokenBody.client_secret = clientSecret;

  const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams(tokenBody).toString(),
  });

  if (!tokenRes.ok) {
    console.error("Etsy token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(
      new URL("/onboarding?error=token_exchange_failed", siteUrl)
    );
  }

  const tokenData = await tokenRes.json();
  const accessToken:  string = tokenData.access_token;
  const refreshToken: string | undefined = tokenData.refresh_token;
  const expiresIn:    number | undefined = tokenData.expires_in; // seconds

  if (!accessToken) {
    return NextResponse.redirect(
      new URL("/onboarding?error=token_exchange_failed", siteUrl)
    );
  }

  // ── Fetch shop / seller info ─────────────────────────────────────────────
  // First get the authenticated user to retrieve their shop_id
  const meRes = await fetch("https://openapi.etsy.com/v3/application/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-api-key":   clientId,
    },
  });

  let shopName   = "My Etsy Shop";
  let etsyShopId = "";

  if (meRes.ok) {
    const meData = await meRes.json();
    const userId  = meData.user_id as number | undefined;

    if (userId) {
      // Fetch the shop associated with this user
      const shopRes = await fetch(
        `https://openapi.etsy.com/v3/application/users/${userId}/shops`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-api-key":   clientId,
          },
        }
      );

      if (shopRes.ok) {
        const shopData = await shopRes.json();
        // Response shape: { shop_id, shop_name, ... } or { results: [...] }
        const shop = shopData.shop_id
          ? shopData
          : (shopData.results?.[0] ?? null);

        if (shop) {
          shopName   = shop.shop_name ?? shopName;
          etsyShopId = String(shop.shop_id ?? "");
        }
      }
    }
  }

  // ── Upsert store in DB ───────────────────────────────────────────────────
  await connectDB();

  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : undefined;

  await StoreModel.findOneAndUpdate(
    { teamId, platform: "etsy", ...(etsyShopId ? { etsyShopId } : {}) },
    {
      teamId,
      name:         shopName,
      platform:     "etsy",
      etsyShopId,
      accessToken:  encrypt(accessToken),
      refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
      tokenExpiresAt,
      syncStatus:   "idle",
      isActive:     true,
    },
    { upsert: true, new: true }
  );

  return NextResponse.redirect(
    new URL("/onboarding?connected=etsy", siteUrl)
  );
}
