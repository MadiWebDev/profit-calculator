import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, objectIdString } from "@/lib/validation";
import { syncTikTokAdSpend } from "@/lib/sync/tiktok-ads";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { logger, toLogError } from "@/lib/logger";
import { z } from "zod";

const SyncBodySchema = z
  .object({
    adAccountId: objectIdString("adAccountId"),
  })
  .strict();

/**
 * POST /api/ad-accounts/tiktok/sync
 *
 * Manual spend sync for a TikTok ad account. Requires a user session with
 * the write:data permission; the account is always scoped to the caller's
 * team — any client-supplied teamId is ignored. Heavy work runs via after()
 * so the client gets an immediate 202.
 */
export async function POST(req: NextRequest) {
  const authed = await requireAuth(req, {
    rateLimitKey: "tiktok-sync",
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
    platform: "tiktok",
    isActive: true,
  }).lean();
  if (!adAccount) {
    return fail("Ad account not found", 404, "AD_ACCOUNT_NOT_FOUND");
  }

  const ent = await checkEntitlement(session.teamId, "adplatforms.connect", {});
  if ("response" in ent) return ent.response;

  after(async () => {
    try {
      await syncTikTokAdSpend(adAccountId, session.teamId);
    } catch (e) {
      logger.error("manual tiktok ad sync failed", toLogError(e), { adAccountId });
    }
  });

  return NextResponse.json({ queued: true, platform: "tiktok" }, { status: 202 });
}
