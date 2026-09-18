import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * GET /api/stores/etsy/callback
 *
 * Etsy redirects here after the user grants (or denies) access.
 * This route is excluded from the auth middleware matcher (see middleware.ts)
 * because the browser redirect from Etsy may not forward the session cookie
 * on the Edge. We recover the teamId from the signed state param instead.
 *
 * Flow:
 *  1. Validate required query params (code, state).
 *  2. Decode state → { teamId, codeVerifier }.
 *  3. Exchange code + codeVerifier for tokens (PKCE — no client_secret needed).
 *  4. Fetch the authenticated user's shop info from Etsy.
 *  5. Upsert the Store document with encrypted tokens.
 *  6. Log the connection to the audit trail.
 *  7. Fire-and-forget initial order sync.
 *  8. Redirect to /onboarding?connected=etsy.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const redirectUri = `${SITE_URL}/api/stores/etsy/callback`;

  // ── User denied access or Etsy returned an error ─────────────────────────
  if (error) {
    return NextResponse.redirect(
      new URL(`/onboarding?error=${encodeURIComponent(error)}`, SITE_URL)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/onboarding?error=invalid_callback", SITE_URL)
    );
  }

  // ── 1. Decode state ───────────────────────────────────────────────────────
  let teamId: string;
  let codeVerifier: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    teamId       = decoded.teamId;
    codeVerifier = decoded.codeVerifier;
    if (!teamId || !codeVerifier) throw new Error("Missing fields");
  } catch {
    return NextResponse.redirect(
      new URL("/onboarding?error=invalid_state", SITE_URL)
    );
  }

  const clientId     = process.env.ETSY_CLIENT_ID!;
  const clientSecret = process.env.ETSY_CLIENT_SECRET; // optional for PKCE

  // ── 2. Exchange code for tokens ───────────────────────────────────────────
  const tokenBody: Record<string, string> = {
    grant_type:    "authorization_code",
    client_id:     clientId,
    redirect_uri:  redirectUri,
    code,
    code_verifier: codeVerifier,
  };
  if (clientSecret) tokenBody.client_secret = clientSecret;

  let tokenData: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams(tokenBody).toString(),
    });

    if (!tokenRes.ok) {
      console.error("[Etsy CB] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        new URL("/onboarding?error=token_exchange_failed", SITE_URL)
      );
    }
    tokenData = await tokenRes.json();
  } catch (e) {
    console.error("[Etsy CB] Token exchange threw:", e);
    return NextResponse.redirect(
      new URL("/onboarding?error=token_exchange_failed", SITE_URL)
    );
  }

  const accessToken:  string           = tokenData.access_token  ?? "";
  const refreshToken: string | undefined = tokenData.refresh_token;
  const expiresIn:    number | undefined = tokenData.expires_in;

  if (!accessToken) {
    return NextResponse.redirect(
      new URL("/onboarding?error=token_exchange_failed", SITE_URL)
    );
  }

  // ── 3. Fetch shop / seller info ───────────────────────────────────────────
  let shopName   = "My Etsy Shop";
  let etsyShopId = "";
  let etsyUserId = "";

  try {
    const meRes = await fetch("https://openapi.etsy.com/v3/application/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-api-key":   clientId,
      },
    });

    if (meRes.ok) {
      const meData   = await meRes.json();
      const userId   = meData.user_id as number | undefined;
      etsyUserId     = userId ? String(userId) : "";

      if (userId) {
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
          // Response is either { shop_id, shop_name, ... } or { results: [...] }
          const shop = shopData.shop_id
            ? shopData
            : (shopData.results?.[0] ?? null);

          if (shop) {
            shopName   = shop.shop_name ?? shopName;
            etsyShopId = String(shop.shop_id ?? "");
          }
        } else {
          console.warn("[Etsy CB] shops fetch failed:", shopRes.status);
        }
      }
    } else {
      console.warn("[Etsy CB] /users/me failed:", meRes.status);
    }
  } catch (e) {
    // Non-fatal — we still have tokens; proceed with defaults
    console.warn("[Etsy CB] Shop info fetch threw (non-fatal):", e);
  }

  // ── 4. Upsert store in DB ─────────────────────────────────────────────────
  let storeId = "";
  try {
    await connectDB();

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const store = await StoreModel.findOneAndUpdate(
      { teamId, platform: "etsy", ...(etsyShopId ? { etsyShopId } : {}) },
      {
        teamId,
        name:          shopName,
        platform:      "etsy",
        etsyShopId,
        accessToken:   encrypt(accessToken),
        refreshToken:  refreshToken ? encrypt(refreshToken) : undefined,
        tokenExpiresAt,
        syncStatus:    "idle",
        isActive:      true,
      },
      { upsert: true, new: true }
    );

    storeId = store._id.toString();
  } catch (dbErr) {
    console.error("[Etsy CB] DB upsert failed:", dbErr);
    return NextResponse.redirect(
      new URL("/onboarding?error=db_error", SITE_URL)
    );
  }

  // ── 5. Audit log (best-effort) ────────────────────────────────────────────
  try {
    // teamId came from our own signed state — it's safe to use as ObjectId
    await logAudit({
      teamId:       new mongoose.Types.ObjectId(teamId),
      // We don't have a userId here (no session in the callback), so we use
      // a synthetic "system" ObjectId consistent with other fire-and-forget flows.
      userId:       new mongoose.Types.ObjectId(teamId), // best proxy available
      action:       "store.connected",
      description:  `Connected Etsy store: ${shopName}${etsyShopId ? ` (shop ${etsyShopId})` : ""}`,
      resourceType: "Store",
      resourceId:   storeId,
      metadata:     { etsyShopId, etsyUserId },
    });
  } catch (auditErr) {
    console.warn("[Etsy CB] Audit log failed (non-fatal):", auditErr);
  }

  // ── 6. Fire-and-forget initial sync ──────────────────────────────────────
  fetch(`${SITE_URL}/api/stores/etsy/sync`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ storeId, teamId }),
  }).catch((e) => console.warn("[Etsy CB] Initial sync trigger failed (non-fatal):", e));

  // ── 7. Redirect to success ────────────────────────────────────────────────
  return NextResponse.redirect(
    new URL(`/onboarding?connected=etsy&shop=${encodeURIComponent(shopName)}`, SITE_URL)
  );
}
