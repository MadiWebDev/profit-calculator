import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { encrypt } from "@/lib/encryption";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import { isValidShopDomain, SHOPIFY_API_VERSION, adminRestBase } from "@/lib/shopify";
import { syncShopifyStore, registerShopifyWebhooks } from "@/lib/sync/shopify";
import mongoose from "mongoose";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, SITE_URL));
}

/**
 * GET /api/stores/shopify/callback
 *
 * Shopify redirects here after the merchant authorises the app.
 * Excluded from the auth middleware matcher (see src/middleware.ts) —
 * we validate the OAuth `state` nonce + shop domain ourselves.
 *
 * Flow:
 *  1. Validate required query params (code, shop, state).
 *  2. Validate shop domain format (open-redirect / SSRF guard).
 *  3. Decode state → { teamId, nonce, shop }.
 *  4. Compare nonce against the HttpOnly cookie set during auth init (CSRF guard).
 *  5. Verify the `shop` in state matches the `shop` query param.
 *  6. Exchange code for access token with Shopify.
 *  7. Fetch shop metadata.
 *  8. Upsert the Store document with the encrypted access token.
 *  9. Register GDPR + order webhooks on the shop.
 * 10. `after()`: run the initial order sync in the background — the redirect
 *     is not blocked, and failures set Store.syncStatus="error" with a
 *     sanitized message (never tokens or raw bodies).
 * 11. Redirect to /onboarding?connected=shopify.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const shop  = searchParams.get("shop");
  const state = searchParams.get("state");

  // ── 1. Validate required params ─────────────────────────────────────────
  if (!code || !shop || !state) {
    logger.warn("[Shopify CB] missing params");
    return redirect("/onboarding?error=invalid_callback");
  }

  // ── 2. Shop domain format guard ──────────────────────────────────────────
  if (!isValidShopDomain(shop)) {
    logger.warn("[Shopify CB] invalid shop domain");
    return redirect("/onboarding?error=invalid_shop");
  }

  // ── 3. Decode state ──────────────────────────────────────────────────────
  let teamId: string;
  let nonce: string;
  let stateShop: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString()) as {
      teamId?: string; nonce?: string; shop?: string;
    };
    teamId = decoded.teamId ?? "";
    nonce = decoded.nonce ?? "";
    stateShop = decoded.shop ?? "";
    if (!teamId || !nonce || !stateShop) throw new Error("incomplete state");
    if (!mongoose.Types.ObjectId.isValid(teamId)) throw new Error("bad teamId");
  } catch (e) {
    logger.warn("[Shopify CB] bad state", {}, toLogError(e));
    return redirect("/onboarding?error=invalid_state");
  }

  // ── 4. CSRF nonce check (one-time use) ────────────────────────────────────
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get("shopify_oauth_nonce")?.value;
  cookieStore.delete("shopify_oauth_nonce");

  if (!cookieNonce || cookieNonce !== nonce) {
    logger.warn("[Shopify CB] nonce mismatch");
    return redirect("/onboarding?error=csrf_mismatch");
  }

  // ── 5. Shop mismatch guard ───────────────────────────────────────────────
  if (stateShop.toLowerCase() !== shop.toLowerCase()) {
    logger.warn("[Shopify CB] shop mismatch");
    return redirect("/onboarding?error=shop_mismatch");
  }

  // ── 5b. Plan limit: connected stores ──────────────────────────────────────
  // A reconnect of the same shop must not be blocked, so this check only
  // applies to new shops (verified again at upsert time).
  try {
    const { checkEntitlement } = await import("@/lib/entitlements");
    const { connectDB: connectDbForEnt } = await import("@/lib/db");
    await connectDbForEnt();
    const existing = await StoreModel.findOne({
      teamId: new mongoose.Types.ObjectId(teamId),
      domain: shop.toLowerCase(),
      platform: "shopify",
      isActive: true,
    }).select("_id").lean();
    if (!existing) {
      const ent = await checkEntitlement(teamId, "stores.connect");
      if ("response" in ent) {
        logger.warn("[Shopify CB] store limit reached");
        return redirect("/onboarding?error=plan_limit");
      }
    }
  } catch (e) {
    // checkEntitlement only throws EntitlementError (handled above);
    // any other error here must not break OAuth — log and continue.
    logger.warn("[Shopify CB] entitlement check failed (non-fatal)", {}, toLogError(e));
  }

  // ── 6. Exchange code for access token ────────────────────────────────────
  const clientId     = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logger.error("[Shopify CB] Shopify OAuth env vars not configured");
    return redirect("/onboarding?error=not_configured");
  }

  let accessToken: string;
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!tokenRes.ok) {
      logger.error("[Shopify CB] token exchange HTTP error", { status: tokenRes.status });
      return redirect("/onboarding?error=token_exchange_failed");
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    accessToken = tokenData.access_token ?? "";
    if (!accessToken) {
      logger.error("[Shopify CB] no access_token in token response");
      return redirect("/onboarding?error=token_exchange_failed");
    }
  } catch (e) {
    logger.error("[Shopify CB] token exchange threw", toLogError(e));
    return redirect("/onboarding?error=token_exchange_failed");
  }

  // ── 7. Fetch shop metadata ────────────────────────────────────────────────
  let shopName = shop;
  let shopId   = "";
  let currency = "USD";
  let timezone = "UTC";
  try {
    const shopRes = await fetch(`${adminRestBase(shop)}/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (shopRes.ok) {
      const shopData = (await shopRes.json()) as {
        shop?: { name?: string; id?: number; currency?: string; iana_timezone?: string };
      };
      shopName = shopData.shop?.name ?? shop;
      shopId   = String(shopData.shop?.id ?? "");
      currency = shopData.shop?.currency ?? "USD";
      timezone = shopData.shop?.iana_timezone ?? "UTC";
    } else {
      logger.warn("[Shopify CB] shop.json fetch failed", { status: shopRes.status });
    }
  } catch (e) {
    logger.warn("[Shopify CB] shop.json fetch threw (non-fatal)", {}, toLogError(e));
  }

  // ── 8. Upsert Store ───────────────────────────────────────────────────────
  let storeId: string;
  try {
    await connectDB();
    const teamOid = new mongoose.Types.ObjectId(teamId);
    const store = await StoreModel.findOneAndUpdate(
      { teamId: teamOid, domain: shop.toLowerCase() },
      {
        teamId: teamOid,
        name: shopName,
        platform: "shopify",
        domain: shop.toLowerCase(),
        shopifyShopId: shopId,
        accessToken: encrypt(accessToken),
        currency,
        timezone,
        syncStatus: "syncing",
        syncError: null,
        isActive: true,
      },
      { upsert: true, new: true }
    );
    storeId = store._id.toString();

    // Audit log — best-effort
    try {
      const session = await auth();
      const userId = (session?.user as { id?: string } | undefined)?.id;
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        await logAudit({
          teamId: teamOid,
          userId: new mongoose.Types.ObjectId(userId),
          action: "store.connected",
          description: `Connected Shopify store: ${shopName}`,
          resourceType: "Store",
          resourceId: storeId,
        });
      }
    } catch (auditErr) {
      logger.warn("[Shopify CB] audit log failed (non-fatal)", {}, toLogError(auditErr));
    }
  } catch (dbErr) {
    logger.error("[Shopify CB] DB upsert failed", toLogError(dbErr));
    return redirect("/onboarding?error=db_error");
  }

  // ── 9+10. Register webhooks + initial sync in the background ─────────────
  // `after()` keeps the response fast; syncShopifyStore sets
  // syncStatus="error" with a sanitized message on failure.
  after(async () => {
    await registerShopifyWebhooks(shop, accessToken, SITE_URL);
    try {
      await syncShopifyStore(storeId, teamId);
    } catch (e) {
      logger.error("[Shopify CB] background initial sync failed", toLogError(e), { storeId });
    }
  });

  // ── 11. Redirect to success ────────────────────────────────────────────────
  return redirect(`/onboarding?connected=shopify&shop=${encodeURIComponent(shopName)}`);
}

export { SHOPIFY_API_VERSION };
