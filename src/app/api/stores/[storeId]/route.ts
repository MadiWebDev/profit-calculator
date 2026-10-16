import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { fail, objectIdString } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { revokeStoreTokens } from "@/lib/disconnect";
import { logger, toLogError } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

/**
 * DELETE /api/stores/[storeId]
 *
 * Disconnect a store integration:
 *  1. Best-effort provider-side token revocation (Meta, TikTok).
 *  2. Clear encrypted tokens locally and mark the store inactive.
 *
 * Historical order data is preserved — only credentials are removed.
 * Requires the write:data team permission; the store must belong to the
 * caller's team.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const authed = await requireAuth(req, {
    rateLimitKey: "store-disconnect",
    permission: "write:data",
  });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const { storeId } = await params;
  const idCheck = objectIdString("storeId").safeParse(storeId);
  if (!idCheck.success) {
    return fail("Invalid storeId", 400, "BAD_REQUEST");
  }

  await connectDB();

  const store = await StoreModel.findOne({
    _id: idCheck.data,
    teamId: session.teamId,
  });
  if (!store) {
    return fail("Store not found", 404, "STORE_NOT_FOUND");
  }

  // Best-effort provider revocation before we wipe local credentials
  await revokeStoreTokens(store);

  store.accessToken = null;
  store.refreshToken = null;
  store.isActive = false;
  store.syncStatus = "disconnected";
  await store.save();

  try {
    await logAudit({
      teamId: new mongoose.Types.ObjectId(session.teamId),
      userId: new mongoose.Types.ObjectId(session.userId),
      action: "store.disconnected",
      description: `Disconnected ${store.platform} store: ${store.name ?? storeId}`,
      resourceType: "Store",
      resourceId: storeId,
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ disconnected: true, storeId });
}
