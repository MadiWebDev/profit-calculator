/**
 * Snapchat Marketing API ad-spend sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()`, the manual
 * POST /api/ad-accounts/snapchat/sync route (authenticated), and the
 * scheduled cron job.
 *
 * Pulls campaign-level daily stats for the last 30 days from
 * /v1/adaccounts/{ad_account_id}/stats with granularity=DAY and
 * breakdown=campaign, and upserts into AdSpendDaily. Idempotent:
 * upserts by (adAccountId, date, campaignId).
 *
 * Snapchat quirks handled here (FINAL-REPORT F2/F17):
 * - The ad-account stats endpoint accepts ONLY `spend` without a
 *   breakdown (any other field → E1008). With breakdown=campaign the
 *   campaign-level fields are accepted, so the request asks for
 *   spend, impressions, swipes and the purchase-conversion fields
 *   with breakdown=campaign.
 * - Money arrives in micro-currency (millionths of the account
 *   currency): spend and conversion_purchases_value are divided by
 *   1e6 before storage — storing them raw inflated spend ~1,000,000×.
 * - Conversions/revenue come from conversion_purchases /
 *   conversion_purchases_value (Snap Pixel purchases), not hardcoded 0.
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
import { getValidSnapchatToken } from "@/lib/snapchat-token";
import { logger, toLogError } from "@/lib/logger";
import { isAdMockMode, mockSpendRowsForRange } from "@/lib/ads/mock";
import {
  computeIncrementalWindow,
  runAdSpendBackfill,
  type BackfillResult,
  type DateChunk,
} from "./backfill";

export interface SnapchatSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
}

export interface SnapchatSyncResult {
  adAccountId: string;
  synced: number;
  pages: number;
  /** Backfill summary (older days fetched this run, if any). */
  backfill?: BackfillResult;
}

const API_BASE = "https://adsapi.snapchat.com/v1";
const DEFAULT_MAX_PAGES = 50;

interface SnapchatCampaignStats {
  id?: string;
  name?: string;
  stats?: {
    spend?: number;
    impressions?: number;
    swipes?: number;
    /** Attributed PURCHASE events (Snap Pixel). */
    conversion_purchases?: number;
    /** Purchase value, in micro-currency like spend. */
    conversion_purchases_value?: number;
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

/**
 * Snapchat reports money in micro-currency: millionths of the ad
 * account's currency (1 USD = 1,000,000 micro). Convert to whole
 * currency units before storage — storing the raw value inflates
 * spend ~1,000,000× (FINAL-REPORT F2b). Applies to `spend` and to
 * `conversion_purchases_value`.
 */
export function snapchatMicroToCurrency(micro: number): number {
  return toNum(micro) / 1e6;
}

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

  const window = computeIncrementalWindow({
    lastSyncAt: adAccount.lastSyncAt ?? null,
    lookbackDays: options.lookbackDays,
  });

  try {
    // Fetch one window (the incremental window, or one backfill
    // chunk). Mock mode upserts deterministic fixtures for the window
    // instead of calling Snapchat. The token is resolved once and
    // reused across chunks.
    let accessToken: string | null = null;
    const ensureToken = async (): Promise<string> => {
      if (accessToken) return accessToken;
      // F2d: the access token lives 1h. Refresh it (via the stored
      // refresh token) before it expires. Accounts connected before
      // refresh tokens were stored have none — their sync fails with
      // NO_REFRESH_TOKEN and a clear reconnect message.
      accessToken = await getValidSnapchatToken(adAccount);
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

      // Snapchat expects ISO-8601 datetimes, e.g. 2026-09-16T00:00:00Z
      const fmt = (d: Date) => d.toISOString().slice(0, 19) + "Z";

      // F2a: the ad-account stats endpoint accepts ONLY `spend` with no
      // breakdown — requesting impressions/swipes/views was rejected
      // with E1008 on every sync. With breakdown=campaign the
      // campaign-level fields are accepted, so request the full
      // delivery + purchase-conversion field set in one call.
      const params = new URLSearchParams({
        granularity: "DAY",
        start_time: fmt(startDate),
        end_time: fmt(endDate),
        breakdown: "campaign",
        fields: "spend,impressions,swipes,conversion_purchases,conversion_purchases_value",
      });
      let url: string | null =
        `${API_BASE}/adaccounts/${encodeURIComponent(adAccount.accountId)}/stats?${params.toString()}`;

      const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
      let pages = 0;

      while (url && pages < maxPages) {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
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
              // F2b: spend is micro-currency — divide by 1e6. Same for
              // the purchase value (F17): conversions/revenue are the
              // Snap Pixel purchase fields, no longer hardcoded 0.
              spend: snapchatMicroToCurrency(toNum(stats.spend)),
              impressions: Math.round(toNum(stats.impressions)),
              // Snapchat reports swipes (up-swipes) as the click equivalent
              clicks: Math.round(toNum(stats.swipes)),
              conversions: Math.round(toNum(stats.conversion_purchases)),
              revenue: snapchatMicroToCurrency(toNum(stats.conversion_purchases_value)),
            });
            result.synced++;
          }
        }

        url = json.paging?.next ?? null;
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
