import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, objectIdString } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { syncMetaAdSpend } from "@/lib/sync/meta-ads";
import { syncTikTokAdSpend } from "@/lib/sync/tiktok-ads";
import { syncGoogleAdSpend } from "@/lib/sync/google-ads";
import { syncPinterestAdSpend } from "@/lib/sync/pinterest-ads";
import { syncSnapchatAdSpend } from "@/lib/sync/snapchat-ads";
import { logger, toLogError } from "@/lib/logger";
import { z } from "zod";

const SyncBodySchema = z
  .object({
    adAccountId: objectIdString("adAccountId"),
  })
  .strict();

const SYNCERS: Record<string, (accountId: string, teamId: string, opts: object) => Promise<unknown>> = {
  meta: syncMetaAdSpend,
  tiktok: syncTikTokAdSpend,
  google: syncGoogleAdSpend,
  pinterest: syncPinterestAdSpend,
  snapchat: syncSnapchatAdSpend,
};

/**
 * POST /api/ad-accounts/sync
 *
 * Manual spend sync for any connected ad account. Requires a user session
 * with the write:data permission; the account is always scoped to the
 * caller's team — any client-supplied teamId is ignored. Heavy work runs
 * via after() so the client gets an immediate 202.
 */
export async function POST(req: NextRequest) {
  const authed = await requireAuth(req, {
    rateLimitKey: "adaccount-sync",
    permission: "write:data",
  });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, SyncBodySchema);
  if ("response" in parsed) return parsed.response;
  const { adAccountId } = parsed.data;

  await connectDB();

  const adAccount = await AdAccountModel.findOne({
    _id: adAccountId,
    teamId: session.teamId,
    isActive: true,
  }).lean();
  if (!adAccount) {
    return fail("Ad account not found", 404, "AD_ACCOUNT_NOT_FOUND");
  }

  const sync = SYNCERS[adAccount.platform];
  if (!sync) {
    return fail(`Sync not supported for platform: ${adAccount.platform}`, 400, "UNSUPPORTED");
  }

  const teamId = session.teamId;
  const accountId = adAccount._id.toString();

  after(
    (async () => {
      try {
        await sync(accountId, teamId, {});
      } catch (err) {
        logger.error("manual ad sync failed", toLogError(err), { accountId, teamId });
      }
    })()
  );

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
