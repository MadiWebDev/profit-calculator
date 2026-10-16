import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import { isAdMockMode } from "@/lib/ads/mock";
import mongoose from "mongoose";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * GET /api/ad-accounts/pinterest/callback
 *
 * Pinterest redirects here after the user grants (or denies) access.
 * Excluded from auth middleware — the browser redirect from Pinterest
 * may not carry the session cookie on the Edge.
 * We recover teamId from the signed state param instead.
 *
 * Flow:
 *  1. Validate query params (code, state).
 *  2. Decode state → { teamId }.
 *  3. Exchange code for access token (Basic auth, authorization_code grant).
 *  4. Fetch the user's ad accounts list.
 *  5. Upsert one AdAccount document per ad account (encrypted token).
 *  6. Log to audit trail.
 *  7. Fire-and-forget initial spend sync.
 *  8. Redirect to /dashboard/settings?connected=pinterest.
 *
 * When AD_MOCK_MODE=true, provider calls are skipped and a single fixture
 * account is upserted instead.
 *
 * Pinterest OAuth docs:
 *  https://developers.pinterest.com/docs/getting-started/authentication/
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
  const decodedState = await verifyOAuthState<{ teamId: string }>("pinterest_oauth_nonce", state);
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
      platform: "pinterest",
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

  await connectDB();

  // ── Mock mode: fixture account, no provider calls ─────────────────────────
  if (isAdMockMode()) {
    try {
      const doc = await AdAccountModel.findOneAndUpdate(
        {
          teamId:    new mongoose.Types.ObjectId(teamId),
          platform:  "pinterest",
          accountId: "mock-pinterest-1",
        },
        {
          teamId:       new mongoose.Types.ObjectId(teamId),
          platform:     "pinterest",
          accountId:    "mock-pinterest-1",
          accountName:  "Mock Pinterest Ads",
          currency:     "USD",
          accessToken:  encrypt("mock-token"),
          syncStatus:   "idle",
          isActive:     true,
        },
        { upsert: true, new: true }
      );

      const { syncPinterestAdSpend } = await import("@/lib/sync/pinterest-ads");
      const docId = doc._id.toString();
      after(
        (async () => {
          try {
            await syncPinterestAdSpend(docId, teamId, {});
          } catch (e) {
            logger.error("[Pinterest CB] Mock initial sync failed", toLogError(e), {
              adAccountId: docId,
            });
          }
        })()
      );
    } catch (dbErr) {
      logger.error("[Pinterest CB] Mock DB upsert failed", toLogError(dbErr), {});
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=db_error", SITE_URL)
      );
    }

    return NextResponse.redirect(
      new URL("/dashboard/settings?connected=pinterest&account=Mock%20Pinterest%20Ads", SITE_URL)
    );
  }

  const appId     = process.env.PINTEREST_APP_ID;
  const appSecret = process.env.PINTEREST_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=pinterest_not_configured", SITE_URL)
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/pinterest/callback`;

  // ── 2. Exchange code for access token ─────────────────────────────────────
  // POST https://api.pinterest.com/v5/oauth/token (Basic auth)
  let accessToken: string;
  let tokenExpiresIn: number | undefined;

  try {
    const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
    const tokenBody = new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method:  "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      logger.error("[Pinterest CB] Token exchange HTTP error", new Error(`status ${tokenRes.status}`), {});
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      logger.error(
        "[Pinterest CB] Token exchange error",
        new Error(String(tokenData.error_description ?? tokenData.error ?? "unknown")),
        {}
      );
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
      );
    }

    accessToken    = tokenData.access_token;
    tokenExpiresIn = tokenData.expires_in; // seconds
  } catch (e) {
    logger.error("[Pinterest CB] Token exchange threw", toLogError(e), {});
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
    );
  }

  // ── 3. Fetch the user's Pinterest ad accounts ─────────────────────────────
  // GET https://api.pinterest.com/v5/ad_accounts
  type AdAccountInfo = {
    id:       string;
    name:     string;
    currency: string;
    status?: string;
  };

  let adAccounts: AdAccountInfo[] = [];

  try {
    const acctRes = await fetch("https://api.pinterest.com/v5/ad_accounts", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (acctRes.ok) {
      const acctData = (await acctRes.json()) as { items?: AdAccountInfo[] };
      adAccounts = acctData.items ?? [];
    } else {
      logger.warn("[Pinterest CB] Ad accounts fetch failed", { status: acctRes.status });
    }
  } catch (e) {
    logger.warn("[Pinterest CB] Ad accounts fetch threw (non-fatal)", {}, toLogError(e));
  }

  if (adAccounts.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=no_ad_accounts", SITE_URL)
    );
  }

  // ── 4. Upsert AdAccount documents ─────────────────────────────────────────
  const tokenExpiresAt = tokenExpiresIn
    ? new Date(Date.now() + tokenExpiresIn * 1000)
    : undefined;

  const upsertedIds: string[] = [];

  for (const acct of adAccounts) {
    // Only connect active accounts when the API reports a status
    if (acct.status && acct.status !== "ACTIVE") continue;

    try {
      const doc = await AdAccountModel.findOneAndUpdate(
        {
          teamId:    new mongoose.Types.ObjectId(teamId),
          platform:  "pinterest",
          accountId: acct.id,
        },
        {
          teamId:        new mongoose.Types.ObjectId(teamId),
          platform:      "pinterest",
          accountId:     acct.id,
          accountName:   acct.name,
          currency:      acct.currency ?? "USD",
          accessToken:   encrypt(accessToken),
          tokenExpiresAt,
          syncStatus:    "idle",
          isActive:      true,
        },
        { upsert: true, new: true }
      );
      upsertedIds.push(doc._id.toString());
    } catch (dbErr) {
      logger.error("[Pinterest CB] DB upsert failed for account", toLogError(dbErr), { accountId: acct.id });
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
      userId:      new mongoose.Types.ObjectId(teamId),
      action:      "store.connected",
      description: `Connected Pinterest Ads: ${adAccounts.map((a) => a.name).join(", ")}`,
      resourceType: "AdAccount",
      resourceId:   upsertedIds[0],
      metadata:     { platform: "pinterest", adAccountCount: adAccounts.length },
    });
  } catch (auditErr) {
    logger.warn("[Pinterest CB] Audit log failed (non-fatal)", {}, toLogError(auditErr));
  }

  // ── 6. Initial spend sync (fire-and-forget) ───────────────────────────────
  // Direct library call via after() — no unauthenticated internal HTTP hop.
  const { syncPinterestAdSpend } = await import("@/lib/sync/pinterest-ads");
  for (const docId of upsertedIds) {
    after(
      (async () => {
        try {
          await syncPinterestAdSpend(docId, teamId, {});
        } catch (e) {
          logger.error("[Pinterest CB] Initial spend sync failed", toLogError(e), {
            adAccountId: docId,
          });
        }
      })()
    );
  }

  // ── 7. Redirect with success ──────────────────────────────────────────────
  const firstName = adAccounts[0].name;
  return NextResponse.redirect(
    new URL(
      `/dashboard/settings?connected=pinterest&account=${encodeURIComponent(firstName)}`,
      SITE_URL
    )
  );
}
