/**
 * Google Ads API spend sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()`, the manual
 * POST /api/ad-accounts/google/sync route (authenticated), and the
 * scheduled cron job (Phase 6).
 *
 * Pulls campaign-level daily stats for the last 30 days via the Google Ads
 * API searchStream endpoint (GAQL) and upserts into AdSpendDaily.
 * Idempotent: upserts by (adAccountId, date, campaignId).
 *
 * When AD_MOCK_MODE=true, deterministic fixture rows are upserted instead.
 *
 * Google Ads API docs:
 * https://developers.google.com/google-ads/api/docs/start
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { getValidGoogleToken } from "@/lib/google-token";
import { logger, toLogError } from "@/lib/logger";
import { isAdMockMode, mockSpendRowsForRange } from "@/lib/ads/mock";
import {
  computeIncrementalWindow,
  runAdSpendBackfill,
  type BackfillResult,
  type DateChunk,
} from "./backfill";

export interface GoogleSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
}

export interface GoogleSyncResult {
  adAccountId: string;
  synced: number;
  pages: number;
  /** Backfill summary (older days fetched this run, if any). */
  backfill?: BackfillResult;
}

const ADS_API_VERSION = "v18";
const DEFAULT_MAX_PAGES = 50;

interface GoogleStreamRow {
  campaign?: { id?: string; name?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: string;
    conversionsValue?: string;
  };
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
      platform: "google",
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

export async function syncGoogleAdSpend(
  adAccountId: string,
  teamId: string,
  options: GoogleSyncOptions = {}
): Promise<GoogleSyncResult> {
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
    platform: "google",
    isActive: true,
  });
  if (!adAccount) throw new Error("Ad account not found");

  const result: GoogleSyncResult = {
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
    // instead of calling Google. Credentials are resolved once and
    // reused across chunks.
    let accessToken: string | null = null;
    const ensureToken = async (): Promise<string> => {
      if (accessToken) return accessToken;
      // F1: the access token lives ~1h. Refresh it (via the stored
      // refresh token) before it expires, instead of dying on the first
      // 401 after connect. getValidGoogleToken throws NO_REFRESH_TOKEN
      // when the account was connected without one — reconnect required.
      accessToken = await getValidGoogleToken(adAccount);
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

      let token = await ensureToken();

      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not configured");

      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const customerId = adAccount.accountId.replace(/-/g, "");

      const query =
        "SELECT campaign.id, campaign.name, segments.date, " +
        "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
        "metrics.conversions, metrics.conversions_value " +
        "FROM campaign " +
        `WHERE segments.date BETWEEN '${fmt(startDate)}' AND '${fmt(endDate)}'`;

      const buildHeaders = (t: string): Record<string, string> => {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${t}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        };
        if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
          headers["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "");
        }
        return headers;
      };

      const runSearchStream = async (t: string) =>
        fetch(
          `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
          {
            method: "POST",
            headers: buildHeaders(t),
            body: JSON.stringify({ query }),
          }
        );

      let res = await runSearchStream(token);

      // The stored token may have expired between the proactive check
      // and the call (clock skew, early revocation): refresh once and
      // retry, mirroring Meta's error-190 retry. A second 401 is fatal.
      if (res.status === 401) {
        const refreshed = await getValidGoogleToken({
          ...adAccount,
          // Force the refresh path: the stored expiry is stale.
          tokenExpiresAt: new Date(0),
        } as typeof adAccount).catch(() => null);
        if (refreshed && refreshed !== token) {
          token = refreshed;
          accessToken = refreshed;
          res = await runSearchStream(token);
        }
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Google Ads API HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      // searchStream returns a JSON array of response batches
      const batches = (await res.json()) as Array<{
        results?: GoogleStreamRow[];
        fieldMask?: string;
        requestId?: string;
      }>;
      result.pages += batches.length;

      const maxRows = (options.maxPages ?? DEFAULT_MAX_PAGES) * 1000;
      let rowsSeen = 0;

      for (const batch of batches) {
        for (const row of batch.results ?? []) {
          if (rowsSeen >= maxRows) break;
          rowsSeen++;

          const dateStr = row.segments?.date ?? "";
          const campaignId = row.campaign?.id ?? "";
          if (!dateStr || !campaignId) continue;

          const num = (v: string | undefined): number => {
            const n = parseFloat(v ?? "0");
            return Number.isFinite(n) ? n : 0;
          };

          await upsertRow(adAccount, teamId, {
            date: new Date(dateStr),
            campaignId,
            campaignName: row.campaign?.name ?? "",
            spend: num(row.metrics?.costMicros) / 1e6,
            impressions: Math.round(num(row.metrics?.impressions)),
            clicks: Math.round(num(row.metrics?.clicks)),
            conversions: num(row.metrics?.conversions),
            revenue: num(row.metrics?.conversionsValue),
          });
          result.synced++;
        }
        if (rowsSeen >= maxRows) break;
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

    logger.info("google ad sync complete", {
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
    logger.error("google ad sync failed", toLogError(err), { adAccountId: result.adAccountId });
    throw err;
  }
}
