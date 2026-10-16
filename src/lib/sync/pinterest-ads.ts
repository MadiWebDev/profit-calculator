/**
 * Pinterest API v5 ad-spend sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()`, a manual
 * POST /api/ad-accounts/pinterest/sync route (authenticated), and the
 * scheduled cron job.
 *
 * Pulls campaign-level daily analytics for the last 30 days from
 * /v5/ad_accounts/{ad_account_id}/analytics with granularity=DAY and
 * upserts into AdSpendDaily. Idempotent: upserts by (adAccountId, date, campaignId).
 *
 * When AD_MOCK_MODE=true, deterministic fixture rows are upserted instead.
 *
 * Pinterest API v5 docs:
 * https://developers.pinterest.com/docs/api/v5/ads-analytics-get/
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { safeDecrypt } from "@/lib/encryption";
import { logger, toLogError } from "@/lib/logger";
import { isAdMockMode, mockSpendRows } from "@/lib/ads/mock";

export interface PinterestSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
}

export interface PinterestSyncResult {
  adAccountId: string;
  synced: number;
  pages: number;
}

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MAX_PAGES = 50;

/** Row shape returned by the Pinterest ad-account analytics endpoint. */
interface PinterestAnalyticsRow {
  DATE?: string;
  CAMPAIGN_ID?: string;
  CAMPAIGN_NAME?: string;
  SPEND_IN_DOLLAR?: number | string;
  IMPRESSION_1?: number | string;
  CLICKTHROUGH_1?: number | string;
  TOTAL_CONVERSIONS?: number | string;
  TOTAL_CONVERSIONS_VALUE?: number | string;
  [key: string]: unknown;
}

interface PinterestAnalyticsResponse {
  items?: PinterestAnalyticsRow[];
  bookmark?: string | null;
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
      platform: "pinterest",
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

export async function syncPinterestAdSpend(
  adAccountId: string,
  teamId: string,
  options: PinterestSyncOptions = {}
): Promise<PinterestSyncResult> {
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
    platform: "pinterest",
    isActive: true,
  });
  if (!adAccount) throw new Error("Ad account not found");

  const result: PinterestSyncResult = {
    adAccountId: adAccount._id.toString(),
    synced: 0,
    pages: 0,
  };

  await AdAccountModel.findByIdAndUpdate(adAccountId, {
    syncStatus: "syncing",
    syncError: null,
  });

  try {
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

    const accessToken = safeDecrypt(adAccount.accessToken);
    if (!accessToken) throw new Error("Ad account is disconnected (no access token)");

    const endDate = new Date();
    const startDate = new Date(
      Date.now() - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 864e5
    );
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    let pages = 0;
    let bookmark: string | null = null;

    const num = (v: number | string | undefined): number => {
      const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
      return Number.isFinite(n) ? n : 0;
    };

    while (pages < maxPages) {
      const params = new URLSearchParams({
        start_date: fmt(startDate),
        end_date: fmt(endDate),
        granularity: "DAY",
        click_window_days: "30",
        engagement_window_days: "30",
        view_window_days: "1",
        conversion_report_time: "TIME_OF_AD_ACTION",
        // TOTAL_CONVERSIONS_VALUE is included so ROAS can be attributed;
        // the other columns are the standard engagement/spend set.
        columns:
          "SPEND_IN_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1,TOTAL_CONVERSIONS,TOTAL_CONVERSIONS_VALUE",
        level: "CAMPAIGN",
      });
      if (bookmark) params.set("bookmark", bookmark);

      const res = await fetch(
        `https://api.pinterest.com/v5/ad_accounts/${encodeURIComponent(adAccount.accountId)}/analytics?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        throw new Error(`Pinterest analytics API HTTP ${res.status}`);
      }

      const json = (await res.json()) as PinterestAnalyticsResponse;
      const rows = json.items ?? [];

      pages++;
      result.pages++;

      for (const row of rows) {
        const dateStr = row.DATE ?? "";
        // Campaign-level rows carry CAMPAIGN_ID; fall back to "unknown"
        // for account-level rollups so no spend is silently dropped.
        const campaignId = row.CAMPAIGN_ID ?? "unknown";
        if (!dateStr) continue;

        const spend = num(row.SPEND_IN_DOLLAR);
        const impressions = Math.round(num(row.IMPRESSION_1));
        const clicks = Math.round(num(row.CLICKTHROUGH_1));
        const conversions = Math.round(num(row.TOTAL_CONVERSIONS));
        const revenue = num(row.TOTAL_CONVERSIONS_VALUE);

        await upsertRow(adAccount, teamId, {
          date: new Date(dateStr),
          campaignId,
          campaignName: row.CAMPAIGN_NAME ?? "",
          spend,
          impressions,
          clicks,
          conversions,
          revenue,
        });
        result.synced++;
      }

      bookmark = json.bookmark ?? null;
      if (!bookmark || rows.length === 0) break;
    }

    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "idle",
      syncError: null,
      lastSyncAt: new Date(),
    });

    logger.info("pinterest ad sync complete", {
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
    logger.error("pinterest ad sync failed", toLogError(err), { adAccountId: result.adAccountId });
    throw err;
  }
}
