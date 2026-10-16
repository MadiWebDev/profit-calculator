import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { fail, objectIdString } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { revokeStoreTokens } from "@/lib/disconnect";
import { logger, toLogError } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

/**
 * DELETE /api/ad-accounts/[id]
 *
 * Disconnect an ad account:
 *  1. Best-effort provider-side token revocation (Meta, TikTok).
 *  2. Clear encrypted tokens locally and mark the account inactive.
 *
 * Historical spend data is preserved — only credentials are removed.
 * Requires the write:data team permission; the account must belong to the
 * caller's team.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await requireAuth(req, {
    rateLimitKey: "adaccount-disconnect",
    permission: "write:data",
  });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const { id } = await params;
  const idCheck = objectIdString("adAccountId").safeParse(id);
  if (!idCheck.success) {
    return fail("Invalid ad account id", 400, "BAD_REQUEST");
  }

  await connectDB();

  const adAccount = await AdAccountModel.findOne({
    _id: idCheck.data,
    teamId: session.teamId,
  });
  if (!adAccount) {
    return fail("Ad account not found", 404, "AD_ACCOUNT_NOT_FOUND");
  }

  // Best-effort provider revocation before we wipe local credentials
  await revokeStoreTokens({
    platform: adAccount.platform,
    accessToken: adAccount.accessToken,
    refreshToken: adAccount.refreshToken,
  });

  adAccount.accessToken = null;
  adAccount.refreshToken = null;
  adAccount.isActive = false;
  adAccount.syncStatus = "disconnected";
  await adAccount.save();

  try {
    await logAudit({
      teamId: new mongoose.Types.ObjectId(session.teamId),
      userId: new mongoose.Types.ObjectId(session.userId),
      action: "store.disconnected",
      description: `Disconnected ${adAccount.platform} ad account: ${adAccount.accountName ?? id}`,
      resourceType: "AdAccount",
      resourceId: id,
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ disconnected: true, adAccountId: id });
}
