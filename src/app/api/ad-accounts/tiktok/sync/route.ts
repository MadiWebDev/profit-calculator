import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { getValidTikTokToken, TikTokTokenError } from "@/lib/tiktok-token";
import mongoose from "mongoose";

/**
 * POST /api/ad-accounts/tiktok/sync
 *
 * Pulls daily campaign-level spend data from the TikTok Marketing API
 * Integrated Report endpoint and upserts it into AdSpendDaily.
 *
 * Called fire-and-forget from the OAuth callback after an account connects,
 * and can be triggered manually from the Settings UI ("Sync now" button).
 *
 * Body: { adAccountId: string, teamId: string }
 *
 * Internal endpoint — no user session required. Ownership is validated
 * by checking that adAccountId + teamId match in the DB.
 *
 * TikTok Reporting API docs:
 *  https://business-api.tiktok.com/portal/docs?id=1740302848100353
 */
export async function POST(req: NextRequest) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { adAccountId?: string; teamId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { adAccountId, teamId } = body;
  if (!adAccountId || !teamId) {
    return NextResponse.json(
      { error: "adAccountId and teamId are required" },
      { status: 400 }
    );
  }

  await connectDB();

  // ── Load and validate ad account ──────────────────────────────────────────
  const adAccount = await AdAccountModel.findOne({
    _id:      adAccountId,
    teamId:   new mongoose.Types.ObjectId(teamId),
    platform: "tiktok",
    isActive: true,
  });

  if (!adAccount) {
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
  }

  // ── Obtain a valid (possibly refreshed) access token ─────────────────────
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
      syncError:  msg,
    });
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  // ── Mark as syncing ───────────────────────────────────────────────────────
  await AdAccountModel.findByIdAndUpdate(adAccountId, {
    syncStatus: "syncing",
    syncError:  null,
  });

  // ── Date range: last 30 days ──────────────────────────────────────────────
  const endDate   = new Date();
  const startDate = new Date(Date.now() - 30 * 864e5);

  const fmt = (d: Date) =>
    d.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const advertiserId = adAccount.accountId;

  try {
    let totalSynced = 0;
    let page        = 1;
    const pageSize  = 100;
    let hasMore     = true;

    // ── Paginate through campaign-level daily report ──────────────────────
    while (hasMore) {
      /**
       * POST /open_api/v1.3/report/integrated/get/
       *
       * data_level:   AUCTION_CAMPAIGN — group by campaign
       * dimensions:   stat_time_day, campaign_id
       * metrics:      spend, impressions, clicks, conversions,
       *               total_purchase_value (attributed revenue), campaign_name
       * report_type:  BASIC
       */
      const reportRes = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/",
        {
          method:  "POST",
          headers: {
            "Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            advertiser_id: advertiserId,
            report_type:   "BASIC",
            data_level:    "AUCTION_CAMPAIGN",
            dimensions:    ["stat_time_day", "campaign_id"],
            metrics: [
              "spend",
              "impressions",
              "clicks",
              "conversion",
              "total_purchase_value",
              "campaign_name",
            ],
            start_date: fmt(startDate),
            end_date:   fmt(endDate),
            page,
            page_size:  pageSize,
            order_field: "stat_time_day",
            order_type:  "ASC",
          }),
        }
      );

      if (!reportRes.ok) {
        const text = await reportRes.text().catch(() => "(unreadable)");
        throw new Error(`TikTok report API HTTP ${reportRes.status}: ${text}`);
      }

      const reportJson: {
        code?:    number;
        message?: string;
        data?: {
          list?: {
            dimensions?: {
              stat_time_day?: string;
              campaign_id?:   string;
            };
            metrics?: {
              spend?:               string;
              impressions?:         string;
              clicks?:              string;
              conversion?:          string;
              total_purchase_value?: string;
              campaign_name?:       string;
            };
          }[];
          page_info?: {
            total_number?: number;
            page?:         number;
            page_size?:    number;
          };
        };
      } = await reportRes.json();

      if (reportJson.code !== 0) {
        throw new Error(
          `TikTok report API error: ${reportJson.message ?? "unknown"}`
        );
      }

      const rows    = reportJson.data?.list ?? [];
      const pgInfo  = reportJson.data?.page_info;

      // ── Upsert each row into AdSpendDaily ────────────────────────────────
      for (const row of rows) {
        const dim     = row.dimensions ?? {};
        const metrics = row.metrics    ?? {};

        const dateStr    = dim.stat_time_day ?? "";          // "YYYY-MM-DD"
        const campaignId = dim.campaign_id   ?? "";

        if (!dateStr || !campaignId) continue;

        const date     = new Date(dateStr);
        const spend    = parseFloat(metrics.spend               ?? "0") || 0;
        const impr     = parseInt(metrics.impressions            ?? "0", 10) || 0;
        const clicks   = parseInt(metrics.clicks                 ?? "0", 10) || 0;
        const convs    = parseInt(metrics.conversion             ?? "0", 10) || 0;
        const revenue  = parseFloat(metrics.total_purchase_value ?? "0") || 0;
        const campName = metrics.campaign_name ?? "";

        // Simple ROAS / CPA
        const roas = spend > 0 ? revenue / spend : 0;
        const cpa  = convs > 0 ? spend   / convs : 0;

        await AdSpendDailyModel.findOneAndUpdate(
          {
            adAccountId: adAccount._id,
            date,
            campaignId,
            // adSetId / adId not used at campaign level — sparse index handles null
          },
          {
            adAccountId:       adAccount._id,
            teamId:            new mongoose.Types.ObjectId(teamId),
            storeId:           adAccount.storeId,
            platform:          "tiktok",
            date,
            campaignId,
            campaignName:      campName,
            spend,
            impressions:       impr,
            clicks,
            conversions:       convs,
            revenueAttributed: revenue,
            profitAttributed:  revenue - spend, // gross profit proxy
            roas,
            cpa,
            currency:          adAccount.currency ?? "USD",
          },
          { upsert: true, new: true }
        );

        totalSynced++;
      }

      // ── Check pagination ─────────────────────────────────────────────────
      const totalRows = pgInfo?.total_number ?? 0;
      hasMore = page * pageSize < totalRows && rows.length === pageSize;
      page++;
    }

    // ── Mark as idle + update lastSyncAt ─────────────────────────────────
    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "idle",
      syncError:  null,
      lastSyncAt: new Date(),
    });

    return NextResponse.json({ ok: true, synced: totalSynced });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown sync error";
    console.error("[TikTok Sync] Failed:", msg);

    await AdAccountModel.findByIdAndUpdate(adAccountId, {
      syncStatus: "error",
      syncError:  msg,
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
