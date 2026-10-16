/**
 * Meta Marketing API ad-spend sync — server-side library (no HTTP hop).
 *
 * Called directly from the OAuth callback via `after()` (replacing the old
 * dead HTTP hop), the manual sync route, and the scheduled cron job.
 *
 * Pulls campaign-level daily insights for the last 30 days from
 * /act_{ad_account_id}/insights with time_increment=1 and upserts into
 * AdSpendDaily. Idempotent: upserts by (adAccountId, date, campaignId).
 *
 * When AD_MOCK_MODE=true, deterministic fixture rows are upserted instead.
 *
 * Meta Marketing API docs:
 * https://developers.facebook.com/docs/marketing-api/insights
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { safeDecrypt } from "@/lib/encryption";
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
}

const API_VERSION = "v21.0";
const DEFAULT_LOOKBACK_DAYS = 30;
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

  const result: MetaSyncResult = {
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

    const params = new URLSearchParams({
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
      time_range: JSON.stringify({ since: fmt(startDate), until: fmt(endDate) }),
      time_increment: "1",
      limit: "100",
      access_token: accessToken,
    });
    let url: string | null =
      `https://graph.facebook.com/${API_VERSION}/act_${adAccount.accountId}/insights?${params.toString()}`;

    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    let pages = 0;

    while (url && pages < maxPages) {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Meta insights API HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        data?: MetaInsightRow[];
        paging?: { next?: string };
        error?: { message?: string; code?: number };
      };
      if (json.error) {
        throw new Error(`Meta insights API error: ${json.error.message ?? "unknown"}`);
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
