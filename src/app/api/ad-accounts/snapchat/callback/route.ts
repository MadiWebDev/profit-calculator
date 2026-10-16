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
const API_BASE = "https://adsapi.snapchat.com/v1";

/**
 * GET /api/ad-accounts/snapchat/callback
 *
 * Snapchat redirects here after the user grants (or denies) access.
 * Excluded from auth middleware — the browser redirect from Snapchat
 * may not carry the session cookie on the Edge.
 * We recover teamId from the signed state param instead.
 *
 * Flow:
 *  1. Validate query params (code, state).
 *  2. Decode state → { teamId } (one-time nonce verified).
 *  3. Exchange code for access token (Basic client_id:client_secret).
 *  4. Fetch the user's organizations → ad accounts.
 *  5. Upsert one AdAccount document per ad account (encrypted token).
 *  6. Log to audit trail.
 *  7. Fire-and-forget initial spend sync.
 *  8. Redirect to /dashboard/settings?connected=snapchat.
 *
 * Snapchat Marketing API OAuth docs:
 * https://developers.snapchat.com/api/marketing-api/auth-and-authentication
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
  const decodedState = await verifyOAuthState<{ teamId: string }>("snapchat_oauth_nonce", state);
  if (!decodedState?.teamId || !mongoose.Types.ObjectId.isValid(decodedState.teamId)) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=invalid_state", SITE_URL)
    );
  }
  const teamId = decodedState.teamId;

  await connectDB();

  // ── 1b. Plan limit: ad platforms (new connections only) ────────────────────
  try {
    const { checkEntitlement } = await import("@/lib/entitlements");
    const existingPlatform = await AdAccountModel.findOne({
      teamId: new mongoose.Types.ObjectId(teamId),
      platform: "snapchat",
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

  // ── Mock mode: fixture account, no provider calls ─────────────────────────
  if (isAdMockMode()) {
    const doc = await AdAccountModel.findOneAndUpdate(
      {
        teamId: new mongoose.Types.ObjectId(teamId),
        platform: "snapchat",
        accountId: "mock-snapchat-1",
      },
      {
        teamId: new mongoose.Types.ObjectId(teamId),
        platform: "snapchat",
        accountId: "mock-snapchat-1",
        accountName: "Mock Snapchat Ads",
        currency: "USD",
        accessToken: null,
        syncStatus: "idle",
        isActive: true,
      },
      { upsert: true, new: true }
    );

    const { syncSnapchatAdSpend } = await import("@/lib/sync/snapchat-ads");
    after(
      (async () => {
        try {
          await syncSnapchatAdSpend(doc._id.toString(), teamId, {});
        } catch (e) {
          logger.error("[Snapchat CB] Mock initial sync failed", toLogError(e), {
            adAccountId: doc._id.toString(),
          });
        }
      })()
    );

    return NextResponse.redirect(
      new URL("/dashboard/settings?connected=snapchat&account=Mock+Snapchat+Ads", SITE_URL)
    );
  }

  const clientId     = process.env.SNAPCHAT_CLIENT_ID;
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=snapchat_not_configured", SITE_URL)
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/snapchat/callback`;

  // ── 2. Exchange code for access token ─────────────────────────────────────
  // POST https://accounts.snapchat.com/login/oauth2/access_token
  // (HTTP Basic auth with client_id:client_secret)
  let accessToken: string;
  let tokenExpiresIn: number | undefined;

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      logger.error("[Snapchat CB] Token exchange HTTP error", new Error(`status ${tokenRes.status}`), {});
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
        "[Snapchat CB] Token exchange error",
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
    logger.error("[Snapchat CB] Token exchange threw", toLogError(e), {});
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
    );
  }

  // ── 3. Fetch the user's organizations → ad accounts ───────────────────────
  // GET /v1/me/organizations (ad accounts are nested under each org)
  type AdAccountInfo = { id: string; name: string; currency?: string };
  const adAccounts: AdAccountInfo[] = [];

  try {
    const orgRes = await fetch(`${API_BASE}/me/organizations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!orgRes.ok) {
      logger.warn("[Snapchat CB] Organizations fetch failed", { status: orgRes.status });
    } else {
      const orgData = (await orgRes.json()) as {
        organizations?: Array<{
          id?: string;
          ad_accounts?: Array<{ id?: string; name?: string; currency?: string }>;
        }>;
      };

      for (const org of orgData.organizations ?? []) {
        // Prefer nested ad accounts; fall back to per-org listing
        let nested = org.ad_accounts ?? [];
        if (nested.length === 0 && org.id) {
          try {
            const acctRes = await fetch(
              `${API_BASE}/organizations/${encodeURIComponent(org.id)}/adaccounts`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (acctRes.ok) {
              const acctData = (await acctRes.json()) as {
                adaccounts?: Array<{ id?: string; name?: string; currency?: string }>;
              };
              nested = acctData.adaccounts ?? [];
            }
          } catch (e) {
            logger.warn("[Snapchat CB] Per-org ad accounts fetch failed", {}, toLogError(e));
          }
        }
        for (const acct of nested) {
          if (acct.id) {
            adAccounts.push({
              id: acct.id,
              name: acct.name ?? acct.id,
              currency: acct.currency,
            });
          }
        }
      }
    }
  } catch (e) {
    logger.warn("[Snapchat CB] Organizations fetch threw (non-fatal)", {}, toLogError(e));
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
  const upsertedNames: string[] = [];

  for (const acct of adAccounts) {
    try {
      const doc = await AdAccountModel.findOneAndUpdate(
        {
          teamId:    new mongoose.Types.ObjectId(teamId),
          platform:  "snapchat",
          accountId: acct.id,
        },
        {
          teamId:        new mongoose.Types.ObjectId(teamId),
          platform:      "snapchat",
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
      upsertedNames.push(acct.name);
    } catch (dbErr) {
      logger.error("[Snapchat CB] DB upsert failed for account", toLogError(dbErr), { accountId: acct.id });
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
      description: `Connected Snapchat Ads: ${upsertedNames.join(", ")}`,
      resourceType: "AdAccount",
      resourceId:   upsertedIds[0],
      metadata:     { platform: "snapchat", adAccountCount: upsertedIds.length },
    });
  } catch (auditErr) {
    logger.warn("[Snapchat CB] Audit log failed (non-fatal)", {}, toLogError(auditErr));
  }

  // ── 6. Initial spend sync (fire-and-forget) ───────────────────────────────
  // Direct library call via after() — no unauthenticated internal HTTP hop.
  const { syncSnapchatAdSpend } = await import("@/lib/sync/snapchat-ads");
  for (const docId of upsertedIds) {
    after(
      (async () => {
        try {
          await syncSnapchatAdSpend(docId, teamId, {});
        } catch (e) {
          logger.error("[Snapchat CB] Initial spend sync failed", toLogError(e), {
            adAccountId: docId,
          });
        }
      })()
    );
  }

  // ── 7. Redirect with success ──────────────────────────────────────────────
  const firstName = upsertedNames[0] ?? "Snapchat";
  return NextResponse.redirect(
    new URL(
      `/dashboard/settings?connected=snapchat&account=${encodeURIComponent(firstName)}`,
      SITE_URL
    )
  );
}
