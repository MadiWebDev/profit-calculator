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
 * GET /api/ad-accounts/google/callback
 *
 * Google redirects here after the user grants (or denies) access.
 * Excluded from auth middleware — the browser redirect from Google
 * may not carry the session cookie on the Edge.
 * We recover teamId from the signed state param instead.
 *
 * Flow:
 *  1. Validate query params (code, state).
 *  2. Decode state → { teamId }.
 *  3. Exchange code for access + refresh tokens (offline access).
 *  4. List accessible Google Ads customers.
 *  5. Upsert one AdAccount document per customer (encrypted tokens).
 *  6. Log to audit trail.
 *  7. Fire-and-forget initial spend sync.
 *  8. Redirect to /dashboard/settings?connected=google.
 *
 * Google OAuth 2.0 docs:
 * https://developers.google.com/identity/protocols/oauth2/web-server
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
  const decodedState = await verifyOAuthState<{ teamId: string }>("google_oauth_nonce", state);
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
      platform: "google",
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
    const doc = await AdAccountModel.findOneAndUpdate(
      {
        teamId: new mongoose.Types.ObjectId(teamId),
        platform: "google",
        accountId: "mock-google-1",
      },
      {
        teamId: new mongoose.Types.ObjectId(teamId),
        platform: "google",
        accountId: "mock-google-1",
        accountName: "Mock Google Ads",
        currency: "USD",
        accessToken: encrypt("mock-access-token"),
        refreshToken: encrypt("mock-refresh-token"),
        syncStatus: "idle",
        isActive: true,
      },
      { upsert: true, new: true }
    );
    const { syncGoogleAdSpend } = await import("@/lib/sync/google-ads");
    after(
      (async () => {
        try {
          await syncGoogleAdSpend(doc._id.toString(), teamId, {});
        } catch (e) {
          logger.error("[Google CB] Mock initial sync failed", toLogError(e), {
            adAccountId: doc._id.toString(),
          });
        }
      })()
    );
    return NextResponse.redirect(
      new URL("/dashboard/settings?connected=google&account=Mock%20Google%20Ads", SITE_URL)
    );
  }

  const clientId     = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=google_not_configured", SITE_URL)
    );
  }

  const redirectUri = `${SITE_URL}/api/ad-accounts/google/callback`;

  // ── 2. Exchange code for tokens ───────────────────────────────────────────
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let tokenExpiresIn: number | undefined;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      logger.error("[Google CB] Token exchange HTTP error", new Error(`status ${tokenRes.status}`), {});
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      logger.error("[Google CB] Token exchange error", new Error(tokenData.error_description ?? tokenData.error ?? "unknown"), {});
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
      );
    }

    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
    tokenExpiresIn = tokenData.expires_in;
  } catch (e) {
    logger.error("[Google CB] Token exchange threw", toLogError(e), {});
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
    );
  }

  if (!accessToken) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=token_exchange_failed", SITE_URL)
    );
  }
  // Narrowed for the closures below
  const googleAccessToken: string = accessToken;

  // ── 3. List accessible customers ──────────────────────────────────────────
  type CustomerInfo = { id: string; name: string; currency: string };
  const customers: CustomerInfo[] = [];

  try {
    const listRes = await fetch(
      "https://googleads.googleapis.com/v18/customers:listAccessibleCustomers",
      { headers: { Authorization: `Bearer ${googleAccessToken}` } }
    );
    if (listRes.ok) {
      const listData = (await listRes.json()) as {
        resourceNames?: string[];
      };
      const ids = (listData.resourceNames ?? [])
        .map((rn) => rn.split("/").pop() ?? "")
        .filter((id) => /^\d+$/.test(id));

      // Best-effort: fetch each customer's descriptive name + currency.
      // Falls back to the bare customer ID when the lookup fails.
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      for (const id of ids.slice(0, 25)) {
        let name = id;
        let currency = "USD";
        if (developerToken) {
          try {
            const qRes = await fetch(
              `https://googleads.googleapis.com/v18/customers/${id}/googleAds:searchStream`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${googleAccessToken}`,
                  "developer-token": developerToken,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  query: "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
                }),
              }
            );
            if (qRes.ok) {
              const qData = (await qRes.json()) as Array<{
                results?: Array<{
                  customer?: { descriptiveName?: string; currencyCode?: string };
                }>;
              }>;
              const customer = qData[0]?.results?.[0]?.customer;
              if (customer?.descriptiveName) name = customer.descriptiveName;
              if (customer?.currencyCode) currency = customer.currencyCode;
            }
          } catch {
            // non-fatal — keep the ID as the display name
          }
        }
        customers.push({ id, name, currency });
      }
    } else {
      logger.warn("[Google CB] Customer list fetch failed", { status: listRes.status });
    }
  } catch (e) {
    logger.warn("[Google CB] Customer list fetch threw (non-fatal)", {}, toLogError(e));
  }

  if (customers.length === 0) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=no_ad_accounts", SITE_URL)
    );
  }

  // ── 4. Upsert AdAccount documents ─────────────────────────────────────────
  const tokenExpiresAt = tokenExpiresIn
    ? new Date(Date.now() + tokenExpiresIn * 1000)
    : undefined;

  const upsertedIds: string[] = [];

  for (const customer of customers) {
    try {
      const doc = await AdAccountModel.findOneAndUpdate(
        {
          teamId:    new mongoose.Types.ObjectId(teamId),
          platform:  "google",
          accountId: customer.id,
        },
        {
          teamId:        new mongoose.Types.ObjectId(teamId),
          platform:      "google",
          accountId:     customer.id,
          accountName:   customer.name,
          currency:      customer.currency,
          accessToken:   encrypt(googleAccessToken),
          ...(refreshToken ? { refreshToken: encrypt(refreshToken) } : {}),
          tokenExpiresAt,
          syncStatus:    "idle",
          isActive:      true,
        },
        { upsert: true, new: true }
      );
      upsertedIds.push(doc._id.toString());
    } catch (dbErr) {
      logger.error("[Google CB] DB upsert failed for account", toLogError(dbErr), { accountId: customer.id });
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
      description: `Connected Google Ads: ${customers.map((c) => c.name).join(", ")}`,
      resourceType: "AdAccount",
      resourceId:   upsertedIds[0],
      metadata:     { platform: "google", adAccountCount: customers.length },
    });
  } catch (auditErr) {
    logger.warn("[Google CB] Audit log failed (non-fatal)", {}, toLogError(auditErr));
  }

  // ── 6. Initial spend sync (fire-and-forget) ───────────────────────────────
  // Direct library call via after() — no unauthenticated internal HTTP hop.
  const { syncGoogleAdSpend } = await import("@/lib/sync/google-ads");
  for (const docId of upsertedIds) {
    after(
      (async () => {
        try {
          await syncGoogleAdSpend(docId, teamId, {});
        } catch (e) {
          logger.error("[Google CB] Initial spend sync failed", toLogError(e), {
            adAccountId: docId,
          });
        }
      })()
    );
  }

  // ── 7. Redirect with success ──────────────────────────────────────────────
  const firstName = customers[0].name;
  return NextResponse.redirect(
    new URL(
      `/dashboard/settings?connected=google&account=${encodeURIComponent(firstName)}`,
      SITE_URL
    )
  );
}
