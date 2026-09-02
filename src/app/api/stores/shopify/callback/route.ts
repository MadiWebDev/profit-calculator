import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { encrypt } from "@/lib/encryption";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function redirect(path: string, req: NextRequest) {
  return NextResponse.redirect(new URL(path, SITE_URL));
}

/**
 * GET /api/stores/shopify/callback
 *
 * Shopify redirects here after the merchant authorises the app.
 * This route is intentionally excluded from the auth middleware matcher
 * so Shopify's redirect is never intercepted by NextAuth on the Edge.
 * We do our own session check here instead.
 *
 * Flow:
 *  1. Validate required query params (code, shop, state).
 *  2. Decode state → { teamId, nonce, shop }.
 *  3. Compare nonce against the HttpOnly cookie set during auth init (CSRF guard).
 *  4. Verify the `shop` in state matches the `shop` query param (open-redirect guard).
 *  5. Exchange code for access token with Shopify.
 *  6. Fetch shop metadata.
 *  7. Upsert the Store document with the encrypted access token.
 *  8. Fire-and-forget: trigger initial order sync.
 *  9. Redirect to /onboarding?connected=shopify.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const shop  = searchParams.get("shop");
  const state = searchParams.get("state");
  const hmac  = searchParams.get("hmac"); // present on real Shopify callbacks

  // ── 1. Validate required params ─────────────────────────────────────────
  if (!code || !shop || !state) {
    console.error("[Shopify CB] Missing params", { code: !!code, shop: !!shop, state: !!state });
    return redirect("/onboarding?error=invalid_callback", req);
  }

  // ── 2. Decode state ──────────────────────────────────────────────────────
  let teamId: string;
  let nonce: string;
  let stateShop: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    teamId    = decoded.teamId;
    nonce     = decoded.nonce;
    stateShop = decoded.shop;
    if (!teamId || !nonce || !stateShop) throw new Error("incomplete state");
  } catch (e) {
    console.error("[Shopify CB] Bad state", e);
    return redirect("/onboarding?error=invalid_state", req);
  }

  // ── 3. CSRF nonce check ──────────────────────────────────────────────────
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get("shopify_oauth_nonce")?.value;
  // Clear the nonce cookie immediately (one-time use)
  cookieStore.delete("shopify_oauth_nonce");

  if (!cookieNonce || cookieNonce !== nonce) {
    console.error("[Shopify CB] Nonce mismatch", { cookieNonce, nonce });
    return redirect("/onboarding?error=csrf_mismatch", req);
  }

  // ── 4. Shop mismatch guard ───────────────────────────────────────────────
  if (stateShop.toLowerCase() !== shop.toLowerCase()) {
    console.error("[Shopify CB] Shop mismatch", { stateShop, shop });
    return redirect("/onboarding?error=shop_mismatch", req);
  }

  // ── 5. Exchange code for access token ────────────────────────────────────
  const clientId     = process.env.SHOPIFY_CLIENT_ID!;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET!;

  let accessToken: string;
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      console.error("[Shopify CB] Token exchange HTTP error", tokenRes.status, txt);
      return redirect("/onboarding?error=token_exchange_failed", req);
    }
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error("[Shopify CB] No access_token in response", tokenData);
      return redirect("/onboarding?error=token_exchange_failed", req);
    }
  } catch (e) {
    console.error("[Shopify CB] Token exchange threw", e);
    return redirect("/onboarding?error=token_exchange_failed", req);
  }

  // ── 6. Fetch shop metadata ────────────────────────────────────────────────
  let shopName  = shop;
  let shopId    = "";
  let currency  = "USD";
  let timezone  = "UTC";
  try {
    const shopRes  = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (shopRes.ok) {
      const shopData = await shopRes.json();
      shopName  = shopData.shop?.name  ?? shop;
      shopId    = String(shopData.shop?.id ?? "");
      currency  = shopData.shop?.currency ?? "USD";
      timezone  = shopData.shop?.iana_timezone ?? "UTC";
    } else {
      console.warn("[Shopify CB] shop.json fetch failed", shopRes.status);
    }
  } catch (e) {
    console.warn("[Shopify CB] shop.json fetch threw", e);
    // Non-fatal — we still have the access token, proceed with defaults
  }

  // ── 7. Upsert Store in DB ─────────────────────────────────────────────────
  try {
    await connectDB();
    const store = await StoreModel.findOneAndUpdate(
      { teamId, domain: shop },
      {
        teamId,
        name: shopName,
        platform: "shopify",
        domain: shop,
        shopifyShopId: shopId,
        accessToken: encrypt(accessToken),
        currency,
        timezone,
        syncStatus: "idle",
        isActive: true,
      },
      { upsert: true, new: true }
    );

    // Audit log — best-effort, don't let it block the redirect
    try {
      const session = await auth();
      const userId  = (session?.user as { id?: string } | undefined)?.id;
      if (userId) {
        await logAudit({
          teamId:       new mongoose.Types.ObjectId(teamId),
          userId:       new mongoose.Types.ObjectId(userId),
          action:       "store.connected",
          description:  `Connected Shopify store: ${shopName} (${shop})`,
          resourceType: "Store",
          resourceId:   store._id.toString(),
        });
      }
    } catch (auditErr) {
      console.warn("[Shopify CB] Audit log failed (non-fatal)", auditErr);
    }

    // ── 8. Fire-and-forget initial sync ──────────────────────────────────
    fetch(`${SITE_URL}/api/stores/shopify/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: store._id.toString(), teamId }),
    }).catch((e) => console.warn("[Shopify CB] Sync trigger failed (non-fatal)", e));

  } catch (dbErr) {
    console.error("[Shopify CB] DB upsert failed", dbErr);
    return redirect("/onboarding?error=db_error", req);
  }

  // ── 9. Redirect to success ────────────────────────────────────────────────
  return redirect(`/onboarding?connected=shopify&shop=${encodeURIComponent(shopName)}`, req);
}
