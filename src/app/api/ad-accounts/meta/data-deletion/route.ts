import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";
import { logger } from "@/lib/logger";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * POST /api/ad-accounts/meta/data-deletion
 *
 * Meta calls this endpoint when a user removes your app from their
 * Facebook settings. We must:
 *  1. Verify the signed_request signature using APP_SECRET
 *  2. Extract the user_id from the payload
 *  3. Delete all Meta AdAccount tokens for that user
 *  4. Return a JSON response with a status_url so Meta can verify deletion
 *
 * Meta Data Deletion Callback docs:
 *  https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    logger.error("[Meta Data Deletion] META_APP_SECRET not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  // ── 1. Parse the signed_request from form body ────────────────────────────
  let signedRequest: string | null = null;

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      signedRequest = params.get("signed_request");
    } else {
      // some versions send JSON
      const body = await req.json();
      signedRequest = body.signed_request ?? null;
    }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!signedRequest) {
    return NextResponse.json({ error: "missing_signed_request" }, { status: 400 });
  }

  // ── 2. Decode & verify the signed_request ────────────────────────────────
  // Format: base64url(signature).base64url(payload)
  const parts = signedRequest.split(".");
  if (parts.length !== 2) {
    return NextResponse.json({ error: "malformed_signed_request" }, { status: 400 });
  }

  const [encodedSig, encodedPayload] = parts;

  // Verify HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();

  const receivedSig = Buffer.from(
    encodedSig.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  if (!crypto.timingSafeEqual(expectedSig, receivedSig)) {
    logger.error("[Meta Data Deletion] Invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  // ── 3. Parse the payload ──────────────────────────────────────────────────
  let payload: { user_id?: string; algorithm?: string; issued_at?: number };

  try {
    const json = Buffer.from(
      encodedPayload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const metaUserId = payload.user_id;

  if (!metaUserId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  // ── 4. Delete Meta ad account tokens for this user ───────────────────────
  // F11: this used to query a `metaUserId` field the schema did not
  // have (Mongoose strict mode dropped the value at OAuth time), so
  // the query could never match — yet the route still returned
  // success to Meta. The field now exists on the schema (stored by
  // the Meta callback from `/v21.0/me`), so the match works, and
  // when nothing matches we say so instead of confirming a deletion
  // that never happened.
  let deletedCount = 0;
  let spendRowsDeleted = 0;
  try {
    await connectDB();

    const accounts = await AdAccountModel.find({
      platform: "meta",
      metaUserId,
    }).select("_id").lean();
    if (accounts.length === 0) {
      logger.warn("[Meta Data Deletion] No Meta accounts for user", { metaUserId });
      return NextResponse.json(
        { error: "no_matching_accounts", code: "NO_MATCHING_ACCOUNTS" },
        { status: 404 }
      );
    }

    const accountIds = accounts.map((a) => a._id);
    const deleted = await AdAccountModel.deleteMany({ _id: { $in: accountIds } });
    deletedCount = deleted.deletedCount ?? 0;

    // The user's synced ad-spend rows are their ad-account data too —
    // delete them with the account instead of leaving orphaned rows.
    const { default: AdSpendDailyModel } = await import("@/models/AdSpendDaily");
    const spendDeleted = await AdSpendDailyModel.deleteMany({
      adAccountId: { $in: accountIds },
    });
    spendRowsDeleted = spendDeleted.deletedCount ?? 0;

    logger.info("[Meta Data Deletion] Meta accounts deleted", {
      metaUserId,
      deletedCount,
      spendRowsDeleted,
    });

    // Audit log (best-effort, no teamId available from Meta callback)
    try {
      await logAudit({
        teamId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        userId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        action:      "store.disconnected",
        description: `Meta data deletion callback received for user ${metaUserId}`,
        resourceType: "AdAccount",
        resourceId:   metaUserId,
        metadata:     { platform: "meta", metaUserId, deletedCount, spendRowsDeleted },
      });
    } catch {
      // Non-fatal — audit failure must not break the deletion response
    }
  } catch (err) {
    logger.error("[Meta Data Deletion] DB error", err);
    // Do NOT return success: Meta must know the deletion did not
    // happen so it can retry, instead of believing the data is gone.
    return NextResponse.json(
      { error: "deletion_failed", code: "DELETION_FAILED" },
      { status: 500 }
    );
  }

  // ── 5. Return confirmation response ──────────────────────────────────────
  // Meta requires: { url: <status_check_url>, confirmation_code: <unique_code> }
  const confirmationCode = crypto
    .createHash("sha256")
    .update(`${metaUserId}-${Date.now()}`)
    .digest("hex")
    .slice(0, 16);

  return NextResponse.json({
    url: `${SITE_URL}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
