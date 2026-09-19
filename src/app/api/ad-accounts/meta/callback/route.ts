import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
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

  // ── 1. Decode state → teamId ──────────────────────────────────────────────
  let teamId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    teamId = decoded.teamId;
    if (!teamId) throw new Error("Missing teamId");
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=invalid_state", SITE_URL)
    );
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
      console.error("[Meta CB] Token exchange HTTP error:", tokenRes.status, await tokenRes.text());
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
      );
    }

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("[Meta CB] Token exchange error:", tokenData.error);
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
    console.error("[Meta CB] Token exchange threw:", e);
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
    console.warn("[Meta CB] Long-lived token exchange failed (non-fatal):", e);
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
      console.warn("[Meta CB] Ad accounts fetch failed:", acctRes.status, await acctRes.text());
    }
  } catch (e) {
    console.warn("[Meta CB] Ad accounts fetch threw (non-fatal):", e);
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
      console.error("[Meta CB] DB upsert failed for account", acct.id, dbErr);
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
    console.warn("[Meta CB] Audit log failed (non-fatal):", auditErr);
  }

  // ── 8. Fire-and-forget initial sync ───────────────────────────────────────
  for (const adAccountId of upsertedIds) {
    fetch(`${SITE_URL}/api/ad-accounts/meta/sync`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ adAccountId, teamId }),
    }).catch((e) =>
      console.warn("[Meta CB] Initial sync trigger failed (non-fatal):", e)
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
