import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { objectIdString } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { syncShopifyStore } from "@/lib/sync/shopify";
import { syncEtsyStore } from "@/lib/sync/etsy";
import { syncWooCommerceStore } from "@/lib/sync/woocommerce";
import { logger, toLogError } from "@/lib/logger";

/**
 * POST /api/stores/[storeId]/sync
 *
 * Triggered by the "Sync now" button in the dashboard Settings → Stores tab
 * and the Overview page's global sync button.
 *
 * Requires a user session with the write:data permission. The store is
 * verified to belong to the caller's team, then the platform-specific sync
 * library runs via after() — no unauthenticated internal HTTP hop.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const authed = await requireAuth(req, {
    rateLimitKey: "store-sync",
    permission: "write:data",
  });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const { storeId } = await params;
  const idCheck = objectIdString("storeId").safeParse(storeId);
  if (!idCheck.success) {
    return NextResponse.json(
      { error: "Invalid storeId", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  await connectDB();

  const store = await StoreModel.findOne({
    _id: idCheck.data,
    teamId: session.teamId,
    isActive: true,
  }).select("platform").lean();

  if (!store) {
    return NextResponse.json(
      { error: "Store not found", code: "STORE_NOT_FOUND" },
      { status: 404 }
    );
  }

  if (!["shopify", "etsy", "woocommerce"].includes(store.platform)) {
    return NextResponse.json(
      { error: `Sync not supported for platform: ${store.platform}`, code: "UNSUPPORTED" },
      { status: 400 }
    );
  }

  const ent = await checkEntitlement(session.teamId, "orders.import", { count: 0 });
  if ("response" in ent) return ent.response;

  const teamId = session.teamId;
  const sid = idCheck.data;
  const platform = store.platform;
  const orderCap = ent.effective.limits.ordersPerMonth;

  after(async () => {
    try {
      if (platform === "shopify") await syncShopifyStore(sid, teamId, { orderCap });
      else if (platform === "etsy") await syncEtsyStore(sid, teamId, { orderCap });
      else if (platform === "woocommerce") await syncWooCommerceStore(sid, teamId, { orderCap });
    } catch (e) {
      logger.error("store sync dispatch failed", toLogError(e), { storeId: sid, platform });
    }
  });

  return NextResponse.json({ queued: true, platform }, { status: 202 });
}
