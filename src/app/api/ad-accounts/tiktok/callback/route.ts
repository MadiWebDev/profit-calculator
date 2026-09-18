import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * GET /api/ad-accounts/tiktok/callback
 *
 * TikTok redirects here after the user grants (or denies) access.
 * Excluded from auth middleware (see middleware.ts) — the browser redirect
 * from TikTok may not carry the session cookie on the Edge.
 * We recover teamId from the signed state param instead.
 *
 * Flow:
 *  1. Validate query params (auth_code, state).
 *  2. Decode state → { teamId }.
 *  3. Exchange auth_code for access + refresh tokens.
 *  4. Fetch the user's advertiser accounts list.
 *  5. Upsert one AdAccount document per advertiser (encrypted tokens).
 *  6. Log to audit trail.
 *  7. Fire-and-forget initial spend sync.
 *  8. Redirect to /dashboard/settings?connected=tiktok.
 *
 * TikTok Marketing API OAuth docs:
 *  https://business-api.tiktok.com/portal/docs?id=1738373164380162
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const authCode = searchParams.get("auth_code");
  const state    = searchParams.get("state");
  const error    = searchParams.get("error");

  // ── User denied access ────────────────────────────────────────────────────
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${encodeURIComponent(error)}`, SITE_URL)
    );
  }

  if (!authCode || !state) {
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

  const appId     = process.env.TIKTOK_APP_ID!;
  const appSecret = process.env.TIKTOK_APP_SECRET!;

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=tiktok_not_configured", SITE_URL)
    );
  }

  // ── 2. Exchange auth_code for tokens ──────────────────────────────────────
  // POST https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/
  let tokenData: {
    data?: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
      advertiser_ids?: string[];
    };
    code?: number;
    message?: string;
  };

  try {
    const tokenRes = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          app_id:     appId,
          secret:     appSecret,
          auth_code:  authCode,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenRes.ok) {
      console.error("[TikTok CB] Token exchange HTTP error:", tokenRes.status, await tokenRes.text());
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
      );
    }

    tokenData = await tokenRes.json();
  } catch (e) {
    console.error("[TikTok CB] Token exchange threw:", e);
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
    );
  }

  // TikTok wraps response in { code, message, data: { ... } }
  // code 0 = success
  if (tokenData.code !== 0 || !tokenData.data?.access_token) {
    console.error("[TikTok CB] Token exchange failed:", tokenData.message);
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=${encodeURIComponent(tokenData.message ?? "token_exchange_failed")}`,
        SITE_URL
      )
    );
  }

  const accessToken   = tokenData.data.access_token;
  const refreshToken  = tokenData.data.refresh_token;
  const expiresIn     = tokenData.data.expires_in;           // seconds
  const advertiserIds = tokenData.data.advertiser_ids ?? [];

  // ── 3. Fetch advertiser account details ───────────────────────────────────
  // GET https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/
  type AdvertiserInfo = {
    advertiser_id:   string;
    advertiser_name: string;
    currency:        string;
  };

  let advertisers: AdvertiserInfo[] = [];

  if (advertiserIds.length > 0) {
    try {
      const advRes = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/` +
        `?app_id=${encodeURIComponent(appId)}` +
        `&secret=${encodeURIComponent(appSecret)}` +
        `&access_token=${encodeURIComponent(accessToken)}`,
        {
          headers: { "Access-Token": accessToken },
        }
      );

      if (advRes.ok) {
        const advData = await advRes.json();
        advertisers = (advData.data?.list ?? []) as AdvertiserInfo[];
      } else {
        console.warn("[TikTok CB] Advertiser list fetch failed:", advRes.status);
      }
    } catch (e) {
      console.warn("[TikTok CB] Advertiser list fetch threw (non-fatal):", e);
    }
  }

  // If we got no advertiser details, build minimal entries from the IDs alone
  if (advertisers.length === 0 && advertiserIds.length > 0) {
    advertisers = advertiserIds.map((id) => ({
      advertiser_id:   id,
      advertiser_name: `TikTok Ads Account ${id}`,
      currency:        "USD",
    }));
  }

  if (advertisers.length === 0) {
    console.warn("[TikTok CB] No advertiser accounts found for this token.");
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=no_advertiser_accounts", SITE_URL)
    );
  }

  // ── 4. Upsert AdAccount documents ─────────────────────────────────────────
  await connectDB();

  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : undefined;

  const upsertedIds: string[] = [];

  for (const adv of advertisers) {
    try {
      const doc = await AdAccountModel.findOneAndUpdate(
        {
          teamId:    new mongoose.Types.ObjectId(teamId),
          platform:  "tiktok",
          accountId: adv.advertiser_id,
        },
        {
          teamId:       new mongoose.Types.ObjectId(teamId),
          platform:     "tiktok",
          accountId:    adv.advertiser_id,
          accountName:  adv.advertiser_name,
          currency:     adv.currency ?? "USD",
          accessToken:  encrypt(accessToken),
          refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
          tokenExpiresAt,
          syncStatus:   "idle",
          isActive:     true,
        },
        { upsert: true, new: true }
      );
      upsertedIds.push(doc._id.toString());
    } catch (dbErr) {
      console.error("[TikTok CB] DB upsert failed for advertiser", adv.advertiser_id, dbErr);
    }
  }

  if (upsertedIds.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=db_error", SITE_URL)
    );
  }

  // ── 5. Audit log ──────────────────────────────────────────────────────────
  try {
    await logAudit({
      teamId:      new mongoose.Types.ObjectId(teamId),
      userId:      new mongoose.Types.ObjectId(teamId), // no session in callback
      action:      "store.connected",                   // reusing existing AuditAction
      description: `Connected TikTok Ads: ${advertisers.map((a) => a.advertiser_name).join(", ")}`,
      resourceType: "AdAccount",
      resourceId:   upsertedIds[0],
      metadata:     { platform: "tiktok", advertiserCount: advertisers.length },
    });
  } catch (auditErr) {
    console.warn("[TikTok CB] Audit log failed (non-fatal):", auditErr);
  }

  // ── 6. Fire-and-forget initial sync for each account ─────────────────────
  for (const adAccountId of upsertedIds) {
    fetch(`${SITE_URL}/api/ad-accounts/tiktok/sync`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ adAccountId, teamId }),
    }).catch((e) =>
      console.warn("[TikTok CB] Initial sync trigger failed (non-fatal):", e)
    );
  }

  // ── 7. Redirect to settings with success banner ───────────────────────────
  const firstName = advertisers[0].advertiser_name;
  return NextResponse.redirect(
    new URL(
      `/dashboard/settings?connected=tiktok&account=${encodeURIComponent(firstName)}`,
      SITE_URL
    )
  );
}
