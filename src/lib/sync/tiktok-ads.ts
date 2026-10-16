/**
 * TikTok Marketing API ad-spend sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()`, the manual
 * POST /api/ad-accounts/tiktok/sync route (authenticated), and the
 * scheduled cron job (Phase 6).
 *
 * Pulls campaign-level daily spend for the last 30 days from the TikTok
 * Integrated Report endpoint and upserts into AdSpendDaily.
 * Idempotent: upserts by (adAccountId, date, campaignId).
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { getValidTikTokToken, TikTokTokenError } from "@/lib/tiktok-token";
import { logger, toLogError } from "@/lib/logger";

export interface TikTokSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
}

export interface TikTokSyncResult {
  adAccountId: string;
  synced: number;
  pages: number;
}

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MAX_PAGES = 50;

export async function syncTikTokAdSpend(
  adAccountId: string,
  teamId: string,
  options: TikTokSyncOptions = {}
): Promise<TikTokSyncResult> {
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
    platform: "tiktok",
    isActive: true,
  });
  if (!adAccount) throw new Error("Ad account not found");

  let accessToken: string;
  try {
    accessToken = await getValidTikTokToken(adAccount);
  } catch (err) {
    const msg =
      err instanceof TikTokTokenError
        ? err.message
        : "Failed to obtain TikTok access token";
    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "error",
      syncError: msg,
    });
    throw new Error(msg);
  }

  await AdAccountModel.findByIdAndUpdate(adAccountId, {
    syncStatus: "syncing",
    syncError: null,
  });

  const result: TikTokSyncResult = {
    adAccountId: adAccount._id.toString(),
    synced: 0,
    pages: 0,
  };

  const endDate = new Date();
  const startDate = new Date(Date.now() - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const advertiserId = adAccount.accountId;

  try {
    let page = 1;
    const pageSize = 100;
    let hasMore = true;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

    while (hasMore && page <= maxPages) {
      const reportRes = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/",
        {
          method: "POST",
          headers: {
            "Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            advertiser_id: advertiserId,
            report_type: "BASIC",
            data_level: "AUCTION_CAMPAIGN",
            dimensions: ["stat_time_day", "campaign_id"],
            metrics: [
              "spend",
              "impressions",
              "clicks",
              "conversion",
              "total_purchase_value",
              "campaign_name",
            ],
            start_date: fmt(startDate),
            end_date: fmt(endDate),
            page,
            page_size: pageSize,
            order_field: "stat_time_day",
            order_type: "ASC",
          }),
        }
      );

      if (!reportRes.ok) {
        throw new Error(`TikTok report API HTTP ${reportRes.status}`);
      }

      const reportJson = (await reportRes.json()) as {
        code?: number;
        message?: string;
        data?: {
          list?: {
            dimensions?: { stat_time_day?: string; campaign_id?: string };
            metrics?: {
              spend?: string;
              impressions?: string;
              clicks?: string;
              conversion?: string;
              total_purchase_value?: string;
              campaign_name?: string;
            };
          }[];
          page_info?: { total_number?: number; page?: number; page_size?: number };
        };
      };

      if (reportJson.code !== 0) {
        throw new Error(`TikTok report API error: ${reportJson.message ?? "unknown"}`);
      }

      const rows = reportJson.data?.list ?? [];
      const pgInfo = reportJson.data?.page_info;
      result.pages++;

      for (const row of rows) {
        const dim = row.dimensions ?? {};
        const metrics = row.metrics ?? {};
        const dateStr = dim.stat_time_day ?? "";
        const campaignId = dim.campaign_id ?? "";
        if (!dateStr || !campaignId) continue;

        const num = (v: string | undefined): number => {
          const n = parseFloat(v ?? "0");
          return Number.isFinite(n) ? n : 0;
        };
        const int = (v: string | undefined): number => {
          const n = parseInt(v ?? "0", 10);
          return Number.isFinite(n) ? n : 0;
        };

        const date = new Date(dateStr);
        const spend = num(metrics.spend);
        const impr = int(metrics.impressions);
        const clicks = int(metrics.clicks);
        const convs = int(metrics.conversion);
        const revenue = num(metrics.total_purchase_value);

        const roas = spend > 0 ? revenue / spend : 0;
        const cpa = convs > 0 ? spend / convs : 0;

        await AdSpendDailyModel.findOneAndUpdate(
          { adAccountId: adAccount._id, date, campaignId },
          {
            adAccountId: adAccount._id,
            teamId: new mongoose.Types.ObjectId(teamId),
            storeId: adAccount.storeId,
            platform: "tiktok",
            date,
            campaignId,
            campaignName: metrics.campaign_name ?? "",
            spend,
            impressions: impr,
            clicks,
            conversions: convs,
            revenueAttributed: revenue,
            profitAttributed: revenue - spend,
            roas,
            cpa,
            currency: adAccount.currency ?? "USD",
          },
          { upsert: true, new: true }
        );

        result.synced++;
      }

      const totalRows = pgInfo?.total_number ?? 0;
      hasMore = page * pageSize < totalRows && rows.length === pageSize;
      page++;
    }

    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "idle",
      syncError: null,
      lastSyncAt: new Date(),
    });

    logger.info("tiktok ad sync complete", {
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
    logger.error("tiktok ad sync failed", toLogError(err), { adAccountId: result.adAccountId });
    throw err;
  }
}
