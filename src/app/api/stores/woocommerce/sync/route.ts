import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, objectIdString, toObjectId } from "@/lib/validation";
import { syncWooCommerceStore } from "@/lib/sync/woocommerce";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { logger, toLogError } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

const SyncBodySchema = z
  .object({
    storeId: objectIdString("storeId"),
  })
  .strict();

/**
 * POST /api/stores/woocommerce/sync
 *
 * Manual "Sync now" for a WooCommerce store. Requires a user session with the
 * write:data permission; the store is always scoped to the caller's team —
 * any client-supplied teamId is ignored. Heavy work runs via after() so the
 * client gets an immediate 202.
 */
export async function POST(req: Request) {
  const authed = await requireAuth(req, {
    rateLimitKey: "woo-sync",
    permission: "write:data",
  });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, SyncBodySchema);
  if ("response" in parsed) return parsed.response;
  const { storeId } = parsed.data;

  await connectDB();

  const store = await StoreModel.findOne({
    _id: toObjectId(storeId),
    teamId: toObjectId(session.teamId),
    platform: "woocommerce",
    isActive: true,
  }).lean();
  if (!store) {
    return fail("Store not found", 404, "STORE_NOT_FOUND");
  }

  // Plan limit: monthly orders — sync stops at the cap, flagging overLimit
  const ent = await checkEntitlement(session.teamId, "orders.import", { count: 0 });
  if ("response" in ent) return ent.response;

  after(async () => {
    try {
      await syncWooCommerceStore(storeId, session.teamId, {
        orderCap: ent.effective.limits.ordersPerMonth,
      });
      try {
        await logAudit({
          teamId: new mongoose.Types.ObjectId(session.teamId),
          userId: new mongoose.Types.ObjectId(session.userId),
          action: "store.synced",
          description: `Manual WooCommerce sync triggered for store ${storeId}`,
          resourceType: "Store",
          resourceId: storeId,
        });
      } catch (e) {
        logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
      }
    } catch (e) {
      logger.error("manual woo sync failed", toLogError(e), { storeId });
    }
  });

  return NextResponse.json({ queued: true, platform: "woocommerce" }, { status: 202 });
}
