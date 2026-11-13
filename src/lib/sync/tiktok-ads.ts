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
import { getValidTikTokToken } from "@/lib/tiktok-token";
import { logger, toLogError } from "@/lib/logger";
import { isAdMockMode, mockSpendRowsForRange } from "@/lib/ads/mock";
import {
  computeIncrementalWindow,
  runAdSpendBackfill,
  type BackfillResult,
  type DateChunk,
} from "./backfill";

export interface TikTokSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
}

export interface TikTokSyncResult {
  adAccountId: string;
  synced: number;
  pages: number;
  /** Backfill summary (older days fetched this run, if any). */
  backfill?: BackfillResult;
}

const DEFAULT_MAX_PAGES = 50;

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
      platform: "tiktok",
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

  await AdAccountModel.findByIdAndUpdate(adAccountId, {
    syncStatus: "syncing",
    syncError: null,
  });

  const result: TikTokSyncResult = {
    adAccountId: adAccount._id.toString(),
    synced: 0,
    pages: 0,
  };

  const window = computeIncrementalWindow({
    lastSyncAt: adAccount.lastSyncAt ?? null,
    lookbackDays: options.lookbackDays,
  });

  try {
    // Fetch one window (the incremental window, or one backfill
    // chunk). Mock mode upserts deterministic fixtures for the window
    // instead of calling TikTok. The token is resolved once and
    // reused across chunks.
    let accessToken: string | null = null;
    const ensureToken = async (): Promise<string> => {
      if (accessToken) return accessToken;
      accessToken = await getValidTikTokToken(adAccount);
      return accessToken;
    };

    const fetchWindow = async (startDate: Date, endDate: Date): Promise<void> => {
      if (isAdMockMode()) {
        for (const row of mockSpendRowsForRange(adAccount.accountId, startDate, endDate)) {
          await upsertRow(adAccount, teamId, {
            ...row,
            date: new Date(row.date),
          });
          result.synced++;
        }
        result.pages += 1;
        return;
      }
      const token = await ensureToken();
      const fmt = (d: Date) => d.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const advertiserId = adAccount.accountId;

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
              "Access-Token": token,
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

          await upsertRow(adAccount, teamId, {
            date: new Date(dateStr),
            campaignId,
            campaignName: metrics.campaign_name ?? "",
            spend: num(metrics.spend),
            impressions: int(metrics.impressions),
            clicks: int(metrics.clicks),
            conversions: int(metrics.conversion),
            revenue: num(metrics.total_purchase_value),
          });

          result.synced++;
        }

        const totalRows = pgInfo?.total_number ?? 0;
        hasMore = page * pageSize < totalRows && rows.length === pageSize;
        page++;
      }
    };

    // Incremental window first (recent data), then the backfill gap
    // (older days, newest chunk first). Backfill is best-effort: a
    // chunk failure is recorded on the result but never fails the sync.
    await fetchWindow(window.startDate, window.endDate);
    result.backfill = await runAdSpendBackfill({
      adAccountId,
      coverageStart: window.startDate,
      fetchChunk: (chunk: DateChunk) => fetchWindow(chunk.startDate, chunk.endDate),
    });

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
