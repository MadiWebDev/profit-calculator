/**
 * Meta Marketing API ad-spend sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()` (replacing the old
 * dead HTTP hop), the manual sync route, and the scheduled cron job.
 *
 * Pulls campaign-level daily insights from /act_{ad_account_id}/insights
 * with time_increment=1 and upserts into AdSpendDaily. Idempotent:
 * upserts by (adAccountId, date, campaignId).
 *
 * Hardening (Phase 5, see src/lib/meta-ads-hardening.ts):
 * - Production guard: AD_MOCK_MODE is refused when NODE_ENV=production
 *   (mock spend in production would silently fake the P&L).
 * - Incremental window: a store that already synced re-pulls from
 *   (lastSyncAt - 3 days) so Meta's delayed-reporting corrections land,
 *   without re-pulling 30 days of history every run. An explicit
 *   lookbackDays forces a full re-sync.
 * - Token refresh: long-lived tokens are exchanged (fb_exchange_token)
 *   when they expire within 7 days or when Meta returns error 190;
 *   the new token is encrypted and stored before retrying once.
 * - Rate limits: 429 / 5xx / Meta rate-limit codes back off
 *   exponentially (Retry-After honoured, capped at 60s), max 3 retries.
 * - Timezone: the time_range uses the ad account's timezone calendar
 *   dates (fetched best-effort from Meta), not UTC dates.
 * - Currency: rows are stored in the ad account's currency; conversion
 *   to the store currency happens at attribution time
 *   (/api/analytics/meta-attribution) with live FX rates, so a rate
 *   change never rewrites history.
 *
 * When AD_MOCK_MODE=true (never in production), deterministic fixture
 * rows are upserted instead.
 *
 * Meta Marketing API docs:
 * https://developers.facebook.com/docs/marketing-api/insights
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { safeDecrypt, encrypt } from "@/lib/encryption";
import {
  resolveSyncWindow,
  dateInTimezone,
  shouldRetryMetaError,
  backoffMs,
  buildTokenExchangeUrl,
  parseTokenExchangeResponse,
} from "@/lib/meta-ads-hardening";
import { logger, toLogError } from "@/lib/logger";
import { isAdMockMode, mockSpendRows } from "@/lib/ads/mock";

export interface MetaSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
}

export interface MetaSyncResult {
  adAccountId: string;
  synced: number;
  pages: number;
  /** "full" on first/manual sync, "incremental" on repeat runs. */
  mode: SyncWindowMode;
}

type SyncWindowMode = "full" | "incremental";

const API_VERSION = "v21.0";
const DEFAULT_MAX_PAGES = 50;

interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
  action_values?: Array<{ action_type?: string; value?: string }>;
}

async function upsertRow(
  adAccount: { _id: mongoose.Types.ObjectId; storeId: mongoose.Types.ObjectId; currency?: string },
  teamId: string,
  row: {
    date: Date;
    campaignId: string;
    campaignName: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  }
): Promise<void> {
  const roas = row.spend > 0 ? row.revenue / row.spend : 0;
  const cpa = row.conversions > 0 ? row.spend / row.conversions : 0;
  await AdSpendDailyModel.findOneAndUpdate(
    { adAccountId: adAccount._id, date: row.date, campaignId: row.campaignId },
    {
      adAccountId: adAccount._id,
      teamId: new mongoose.Types.ObjectId(teamId),
      storeId: adAccount.storeId,
      platform: "meta",
      date: row.date,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      revenueAttributed: row.revenue,
      profitAttributed: row.revenue - row.spend,
      roas,
      cpa,
      currency: adAccount.currency ?? "USD",
    },
    { upsert: true, new: true }
  );
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MetaErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

/** Fetch with exponential backoff on retryable Meta failures. */
async function metaFetch(url: string, attempt = 0): Promise<{ status: number; json: MetaErrorBody & Record<string, unknown> }> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as MetaErrorBody & Record<string, unknown>;
  if (!res.ok && attempt < 3 && shouldRetryMetaError({ status: res.status, code: json.error?.code })) {
    const retryAfter = res.headers.get("Retry-After");
    const retryAfterMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000 || 0, 60000) : 0;
    await sleep(retryAfterMs || backoffMs(attempt));
    return metaFetch(url, attempt + 1);
  }
  return { status: res.status, json };
}

/**
 * Exchange the stored token for a fresh long-lived token and persist
 * it encrypted. Returns null when the app credentials are missing
 * (caller keeps using the existing token) — never throws for that case.
 */
async function refreshMetaToken(
  adAccount: { _id: mongoose.Types.ObjectId; accessToken: string | null }
): Promise<string | null> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const current = safeDecrypt(adAccount.accessToken);
  if (!appId || !appSecret || !current) return null;
  const res = await fetch(buildTokenExchangeUrl(appId, appSecret, current));
  const json = await res.json().catch(() => ({}));
  const parsed = parseTokenExchangeResponse(json);
  await AdAccountModel.findByIdAndUpdate(adAccount._id, {
    accessToken: encrypt(parsed.accessToken),
    tokenExpiresAt: parsed.expiresIn
      ? new Date(Date.now() + parsed.expiresIn * 1000)
      : undefined,
  });
  return parsed.accessToken;
}

export async function syncMetaAdSpend(
  adAccountId: string,
  teamId: string,
  options: MetaSyncOptions = {}
): Promise<MetaSyncResult> {
  await connectDB();

  if (
    !mongoose.Types.ObjectId.isValid(adAccountId) ||
    !mongoose.Types.ObjectId.isValid(teamId)
  ) {
    throw new Error("Invalid adAccountId or teamId");
  }

  const adAccount = await AdAccountModel.findOne({
    _id: adAccountId,
    teamId: new mongoose.Types.ObjectId(teamId),
    platform: "meta",
    isActive: true,
  });
  if (!adAccount) throw new Error("Ad account not found");

  const window = resolveSyncWindow({
    lastSyncAt: adAccount.lastSyncAt ?? null,
    lookbackDays: options.lookbackDays,
  });
  const result: MetaSyncResult = {
    adAccountId: adAccount._id.toString(),
    synced: 0,
    pages: 0,
    mode: window.mode,
  };

  await AdAccountModel.findByIdAndUpdate(adAccountId, {
    syncStatus: "syncing",
    syncError: null,
  });

  try {
    // ── Production guard: mock spend must never reach production ────────
    if (process.env.NODE_ENV === "production" && isAdMockMode()) {
      throw new Error("AD_MOCK_MODE is not allowed in production");
    }
    // ── Mock mode: deterministic fixtures, no provider calls ──────────────
    if (isAdMockMode()) {
      for (const row of mockSpendRows(adAccount.accountId)) {
        await upsertRow(adAccount, teamId, {
          ...row,
          date: new Date(row.date),
        });
        result.synced++;
      }
      result.pages = 1;
      await AdAccountModel.findByIdAndUpdate(adAccountId, {
        syncStatus: "idle",
        syncError: null,
        lastSyncAt: new Date(),
      });
      return result;
    }

    let accessToken = safeDecrypt(adAccount.accessToken);
    if (!accessToken) throw new Error("Ad account is disconnected (no access token)");

    // Proactive refresh when the token expires within 7 days.
    const expiresSoon =
      adAccount.tokenExpiresAt && adAccount.tokenExpiresAt.getTime() - Date.now() < 7 * 864e5;
    if (expiresSoon) {
      const refreshed = await refreshMetaToken(adAccount).catch(() => null);
      if (refreshed) accessToken = refreshed;
    }

    // Ad account timezone, best-effort: one cheap call, cached on the
    // account so repeat syncs don't pay for it again.
    let timezone = adAccount.timezone ?? null;
    if (!timezone) {
      try {
        const tzRes = await fetch(
          `https://graph.facebook.com/${API_VERSION}/act_${adAccount.accountId}?fields=timezone_name&access_token=${encodeURIComponent(accessToken)}`
        );
        const tzJson = (await tzRes.json().catch(() => ({}))) as { timezone_name?: string };
        if (tzJson.timezone_name) {
          timezone = tzJson.timezone_name;
          await AdAccountModel.findByIdAndUpdate(adAccount._id, { timezone });
        }
      } catch {
        // Timezone stays null -> UTC dates (documented fallback).
      }
    }

    const params = new URLSearchParams({
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
      time_range: JSON.stringify({
        since: dateInTimezone(window.startDate, timezone),
        until: dateInTimezone(window.endDate, timezone),
      }),
      time_increment: "1",
      limit: "100",
      access_token: accessToken,
    });
    let url: string | null =
      `https://graph.facebook.com/${API_VERSION}/act_${adAccount.accountId}/insights?${params.toString()}`;

    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    let pages = 0;
    let tokenRefreshedOnce = false;

    while (url && pages < maxPages) {
      const { status, json: raw } = await metaFetch(url);
      const json = raw as {
        data?: MetaInsightRow[];
        paging?: { next?: string };
        error?: { message?: string; code?: number };
      };
      if (json.error) {
        // Expired token (190): refresh once and restart the sync from
        // page one. Any other error is fatal for this run.
        if (json.error.code === 190 && !tokenRefreshedOnce) {
          const refreshed = await refreshMetaToken(adAccount).catch(() => null);
          if (refreshed) {
            tokenRefreshedOnce = true;
            accessToken = refreshed;
            const retryParams = new URLSearchParams(params);
            retryParams.set("access_token", accessToken);
            url = `https://graph.facebook.com/${API_VERSION}/act_${adAccount.accountId}/insights?${retryParams.toString()}`;
            continue;
          }
        }
        throw new Error(`Meta insights API error: ${json.error.message ?? "unknown"}`);
      }
      if (status >= 400) {
        throw new Error(`Meta insights API HTTP ${status}`);
      }

      pages++;
      result.pages++;

      for (const row of json.data ?? []) {
        const dateStr = row.date_start?.slice(0, 10) ?? "";
        const campaignId = row.campaign_id ?? "";
        if (!dateStr || !campaignId) continue;

        const num = (v: string | undefined): number => {
          const n = parseFloat(v ?? "0");
          return Number.isFinite(n) ? n : 0;
        };
        const conversions = (row.actions ?? [])
          .filter((a) => a.action_type === "offsite_conversion" || a.action_type === "purchase")
          .reduce((s, a) => s + num(a.value), 0);
        // Attributed revenue from purchase conversion values (when the
        // advertiser's pixel reports them); 0 when unavailable.
        const revenue = (row.action_values ?? [])
          .filter((a) => a.action_type === "offsite_conversion" || a.action_type === "purchase")
          .reduce((s, a) => s + num(a.value), 0);

        await upsertRow(adAccount, teamId, {
          date: new Date(dateStr),
          campaignId,
          campaignName: row.campaign_name ?? "",
          spend: num(row.spend),
          impressions: Math.round(num(row.impressions)),
          clicks: Math.round(num(row.clicks)),
          conversions: Math.round(conversions),
          revenue,
        });
        result.synced++;
      }

      url = json.paging?.next ?? null;
    }

    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "idle",
      syncError: null,
      lastSyncAt: new Date(),
    });

    logger.info("meta ad sync complete", {
      adAccountId: result.adAccountId,
      synced: result.synced,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "Sync failed";
    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "error",
      syncError: message,
    });
    logger.error("meta ad sync failed", toLogError(err), { adAccountId: result.adAccountId });
    throw err;
  }
}
