import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import mongoose from "mongoose";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * GET /api/ad-accounts/meta/callback
 *
 * Meta redirects here after the user grants (or denies) access.
 * Excluded from auth middleware — the browser redirect from Meta
 * may not carry the session cookie on the Edge.
 * We recover teamId from the signed state param instead.
 *
 * Flow:
 *  1. Validate query params (code, state).
 *  2. Decode state → { teamId }.
 *  3. Exchange code for access token.
 *  4. Fetch the user's ad accounts list.
 *  5. Upsert one AdAccount document per ad account (encrypted token).
 *  6. Log to audit trail.
 *  7. Fire-and-forget initial spend sync.
 *  8. Redirect to /dashboard/settings?connected=meta.
 *
 * Meta Marketing API OAuth docs:
 *  https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // ── User denied access ────────────────────────────────────────────────────
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${encodeURIComponent(error)}`, SITE_URL)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=invalid_callback", SITE_URL)
    );
  }

  // ── 1. Verify state (CSRF nonce) → { teamId } ─────────────────────────────
  const { verifyOAuthState } = await import("@/lib/oauth-state");
  const decodedState = await verifyOAuthState<{ teamId: string }>("meta_oauth_nonce", state);
  if (!decodedState?.teamId || !mongoose.Types.ObjectId.isValid(decodedState.teamId)) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=invalid_state", SITE_URL)
    );
  }
  const teamId = decodedState.teamId;

  // ── 1b. Plan limit: ad platforms (new connections only) ────────────────────
  try {
    const { checkEntitlement } = await import("@/lib/entitlements");
    const existingPlatform = await AdAccountModel.findOne({
      teamId: new mongoose.Types.ObjectId(teamId),
      platform: "meta",
      isActive: true,
    }).select("_id").lean();
    if (!existingPlatform) {
      const ent = await checkEntitlement(teamId, "adplatforms.connect");
      if ("response" in ent) {
        return NextResponse.redirect(
          new URL("/dashboard/settings?error=plan_limit", SITE_URL)
        );
      }
    }
  } catch {
    // Non-fatal: entitlement failures must not break OAuth mid-flight.
    // The auth-init route already gated this; the callback re-checks best-effort.
  }

  const appId     = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=meta_not_configured", SITE_URL)
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/meta/callback`;

  // ── 2. Exchange code for access token ─────────────────────────────────────
  // GET https://graph.facebook.com/v21.0/oauth/access_token
  let accessToken: string;
  let tokenExpiresIn: number | undefined;

  try {
    const tokenParams = new URLSearchParams({
      client_id:     appId,
      client_secret: appSecret,
      redirect_uri:  redirectUri,
      code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams.toString()}`
    );

    if (!tokenRes.ok) {
      logger.error("[Meta CB] Token exchange HTTP error", new Error(`status ${tokenRes.status}`), {});
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
      );
    }

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      logger.error("[Meta CB] Token exchange error", new Error(String(tokenData.error?.message ?? "unknown")), {});
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?error=${encodeURIComponent(tokenData.error.message ?? "token_exchange_failed")}`,
          SITE_URL
        )
      );
    }

    accessToken    = tokenData.access_token;
    tokenExpiresIn = tokenData.expires_in; // seconds
  } catch (e) {
    logger.error("[Meta CB] Token exchange threw", toLogError(e), {});
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
    );
  }

  // ── 3. Exchange short-lived token for long-lived token (60 days) ──────────
  // https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
  try {
    const llParams = new URLSearchParams({
      grant_type:        "fb_exchange_token",
      client_id:         appId,
      client_secret:     appSecret,
      fb_exchange_token: accessToken,
    });

    const llRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${llParams.toString()}`
    );

    if (llRes.ok) {
      const llData = await llRes.json();
      if (llData.access_token) {
        accessToken    = llData.access_token;
        tokenExpiresIn = llData.expires_in ?? tokenExpiresIn;
      }
    }
  } catch (e) {
    logger.warn("[Meta CB] Long-lived token exchange failed (non-fatal)", {}, toLogError(e));
  }

  // ── 4. Fetch the user's Meta ad accounts ─────────────────────────────────
  // GET https://graph.facebook.com/v21.0/me/adaccounts
  type AdAccountInfo = {
    id:       string; // act_XXXXXXXXX
    name:     string;
    currency: string;
    account_status: number;
  };

  let adAccounts: AdAccountInfo[] = [];

  try {
    const acctParams = new URLSearchParams({
      fields:       "id,name,currency,account_status",
      access_token: accessToken,
    });

    const acctRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?${acctParams.toString()}`
    );

    if (acctRes.ok) {
      const acctData = await acctRes.json();
      adAccounts = acctData.data ?? [];
    } else {
      logger.warn("[Meta CB] Ad accounts fetch failed", { status: acctRes.status });
    }
  } catch (e) {
    logger.warn("[Meta CB] Ad accounts fetch threw (non-fatal)", {}, toLogError(e));
  }

  if (adAccounts.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=no_ad_accounts", SITE_URL)
    );
  }

  // ── 5. Fetch Meta user ID for data-deletion linking ───────────────────────
  let metaUserId = "";
  try {
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id&access_token=${encodeURIComponent(accessToken)}`
    );
    if (meRes.ok) {
      const meData = await meRes.json();
      metaUserId = meData.id ?? "";
    }
  } catch {
    // non-fatal
  }

  // ── 6. Upsert AdAccount documents ─────────────────────────────────────────
  await connectDB();

  const tokenExpiresAt = tokenExpiresIn
    ? new Date(Date.now() + tokenExpiresIn * 1000)
    : undefined;

  const upsertedIds: string[] = [];

  for (const acct of adAccounts) {
    // Only connect active accounts (status 1 = ACTIVE)
    if (acct.account_status !== 1) continue;

    try {
      const doc = await AdAccountModel.findOneAndUpdate(
        {
          teamId:    new mongoose.Types.ObjectId(teamId),
          platform:  "meta",
          accountId: acct.id,
        },
        {
          teamId:        new mongoose.Types.ObjectId(teamId),
          platform:      "meta",
          accountId:     acct.id,
          accountName:   acct.name,
          currency:      acct.currency ?? "USD",
          accessToken:   encrypt(accessToken),
          metaUserId,
          tokenExpiresAt,
          syncStatus:    "idle",
          isActive:      true,
        },
        { upsert: true, new: true }
      );
      upsertedIds.push(doc._id.toString());
    } catch (dbErr) {
      logger.error("[Meta CB] DB upsert failed for account", toLogError(dbErr), { accountId: acct.id });
    }
  }

  if (upsertedIds.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=db_error", SITE_URL)
    );
  }

  // ── 7. Audit log ──────────────────────────────────────────────────────────
  try {
    await logAudit({
      teamId:      new mongoose.Types.ObjectId(teamId),
      userId:      new mongoose.Types.ObjectId(teamId),
      action:      "store.connected",
      description: `Connected Meta Ads: ${adAccounts.map((a) => a.name).join(", ")}`,
      resourceType: "AdAccount",
      resourceId:   upsertedIds[0],
      metadata:     { platform: "meta", adAccountCount: adAccounts.length },
    });
  } catch (auditErr) {
    logger.warn("[Meta CB] Audit log failed (non-fatal)", {}, toLogError(auditErr));
  }

  // ── 8. Initial spend sync (fire-and-forget) ───────────────────────────────
  // Direct library call via after() — no unauthenticated internal HTTP hop.
  const { syncMetaAdSpend } = await import("@/lib/sync/meta-ads");
  for (const docId of upsertedIds) {
    after(
      (async () => {
        try {
          await syncMetaAdSpend(docId, teamId, {});
        } catch (e) {
          logger.error("[Meta CB] Initial spend sync failed", toLogError(e), {
            adAccountId: docId,
          });
        }
      })()
    );
  }

  // ── 9. Redirect with success ──────────────────────────────────────────────
  const firstName = adAccounts[0].name;
  return NextResponse.redirect(
    new URL(
      `/dashboard/settings?connected=meta&account=${encodeURIComponent(firstName)}`,
      SITE_URL
    )
  );
}
