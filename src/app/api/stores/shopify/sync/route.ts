import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, objectIdString, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { syncShopifyStore } from "@/lib/sync/shopify";
import { logger, toLogError } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

const SyncBodySchema = z
  .object({
    storeId: objectIdString("storeId"),
    // `since` allows a manual backfill window; ISO datetime, capped to the past
    since: z.iso.datetime().optional(),
  })
  .strict();

/**
 * POST /api/stores/shopify/sync
 *
 * Manual refresh of a Shopify store. Requires a user session; the store must
 * belong to the caller's team. Any client-supplied teamId is ignored — the
 * team always comes from the session. Body is Zod-validated.
 */
export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "shopify-sync" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, SyncBodySchema);
  if ("response" in parsed) return parsed.response;
  const { storeId, since } = parsed.data;

  await connectDB();

  // Authorize: the store must belong to the caller's team
  const store = await StoreModel.findOne({
    _id: toObjectId(storeId),
    teamId: toObjectId(session.teamId),
    platform: "shopify",
    isActive: true,
  }).lean();
  if (!store) {
    return fail("Store not found", 404, "STORE_NOT_FOUND");
  }

  // Plan limit: monthly orders — sync stops at the cap, flagging overLimit
  // orders instead of deleting them.
  const ent = await checkEntitlement(session.teamId, "orders.import", { count: 0 });
  if ("response" in ent) return ent.response;

  try {
    const result = await syncShopifyStore(storeId, session.teamId, {
      since: since ? new Date(since) : undefined,
      orderCap: ent.effective.limits.ordersPerMonth,
    });

    try {
      await logAudit({
        teamId: new mongoose.Types.ObjectId(session.teamId),
        userId: new mongoose.Types.ObjectId(session.userId),
        action: "store.synced",
        description: `Manual Shopify sync: ${result.synced} orders`,
        resourceType: "Store",
        resourceId: storeId,
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json({
      synced: result.synced,
      skipped: result.skipped,
      overLimit: result.overLimit,
      pages: result.pages,
      incremental: result.incremental,
    });
  } catch (e) {
    logger.error("manual shopify sync failed", toLogError(e), { storeId });
    return fail("Sync failed", 500, "SYNC_FAILED");
  }
}
