/**
 * Snapchat Marketing API ad-spend sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()`, the manual
 * POST /api/ad-accounts/snapchat/sync route (authenticated), and the
 * scheduled cron job.
 *
 * Pulls campaign-level daily stats for the last 30 days from
 * /v1/adaccounts/{ad_account_id}/stats with granularity=DAY and upserts
 * into AdSpendDaily. Idempotent: upserts by (adAccountId, date, campaignId).
 *
 * When AD_MOCK_MODE=true, deterministic fixture rows are upserted instead.
 *
 * Snapchat Marketing API docs:
 * https://developers.snapchat.com/api/marketing-api
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { safeDecrypt } from "@/lib/encryption";
import { logger, toLogError } from "@/lib/logger";
import { isAdMockMode, mockSpendRows } from "@/lib/ads/mock";

export interface SnapchatSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
}

export interface SnapchatSyncResult {
  adAccountId: string;
  synced: number;
  pages: number;
}

const API_BASE = "https://adsapi.snapchat.com/v1";
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MAX_PAGES = 50;

interface SnapchatCampaignStats {
  id?: string;
  name?: string;
  stats?: {
    spend?: number;
    impressions?: number;
    swipes?: number;
    quartile_1_views?: number;
  };
}

interface SnapchatTimeseriesEntry {
  start_time?: string;
  end_time?: string;
  stats?: {
    spend?: number;
    impressions?: number;
    swipes?: number;
  };
  breakdown_stats?: {
    campaign?: SnapchatCampaignStats[];
  };
}

async function upsertRow(
  adAccount: { _id: mongoose.Types.ObjectId; storeId?: mongoose.Types.ObjectId; currency?: string },
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
      platform: "snapchat",
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

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function syncSnapchatAdSpend(
  adAccountId: string,
  teamId: string,
  options: SnapchatSyncOptions = {}
): Promise<SnapchatSyncResult> {
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
    platform: "snapchat",
    isActive: true,
  });
  if (!adAccount) throw new Error("Ad account not found");

  const result: SnapchatSyncResult = {
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
    // Snapchat expects ISO-8601 datetimes, e.g. 2026-09-16T00:00:00Z
    const fmt = (d: Date) => d.toISOString().slice(0, 19) + "Z";

    const params = new URLSearchParams({
      granularity: "DAY",
      start_time: fmt(startDate),
      end_time: fmt(endDate),
      fields: "spend,impressions,swipes,quartile_1_views",
    });
    let url: string | null =
      `${API_BASE}/adaccounts/${encodeURIComponent(adAccount.accountId)}/stats?${params.toString()}`;

    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    let pages = 0;

    while (url && pages < maxPages) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Snapchat stats API HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        timeseries_stats?: SnapchatTimeseriesEntry[];
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (json.error) {
        throw new Error(`Snapchat stats API error: ${json.error.message ?? "unknown"}`);
      }

      pages++;
      result.pages++;

      for (const entry of json.timeseries_stats ?? []) {
        const dateStr = entry.start_time?.slice(0, 10) ?? "";
        if (!dateStr) continue;

        const campaigns = entry.breakdown_stats?.campaign ?? [];
        if (campaigns.length === 0) {
          // No campaign breakdown — skip rather than attributing to a
          // synthetic row; totals would double-count on re-sync.
          continue;
        }

        for (const campaign of campaigns) {
          const campaignId = campaign.id ?? "";
          if (!campaignId) continue;
          const stats = campaign.stats ?? {};

          await upsertRow(adAccount, teamId, {
            date: new Date(dateStr),
            campaignId,
            campaignName: campaign.name ?? "",
            spend: toNum(stats.spend),
            impressions: Math.round(toNum(stats.impressions)),
            // Snapchat reports swipes (up-swipes) as the click equivalent
            clicks: Math.round(toNum(stats.swipes)),
            // Basic stats carry no conversion counts
            conversions: 0,
            revenue: 0,
          });
          result.synced++;
        }
      }

      url = json.paging?.next ?? null;
    }

    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "idle",
      syncError: null,
      lastSyncAt: new Date(),
    });

    logger.info("snapchat ad sync complete", {
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
    logger.error("snapchat ad sync failed", toLogError(err), { adAccountId: result.adAccountId });
    throw err;
  }
}
