import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

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
    console.error("[Meta Data Deletion] META_APP_SECRET not configured");
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
    console.error("[Meta Data Deletion] Invalid signature");
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
  try {
    await connectDB();

    // Find all Meta AdAccounts where the external metaUserId matches
    // We store metaUserId in the accountId field during OAuth
    const deleted = await AdAccountModel.deleteMany({
      platform: "meta",
      metaUserId: metaUserId,
    });

    // Also nullify tokens on any account linked by this meta user id
    // in case they were stored differently
    await AdAccountModel.updateMany(
      { platform: "meta", accountId: metaUserId },
      {
        $set: {
          accessToken:  null,
          refreshToken: null,
          isActive:     false,
          syncStatus:   "deleted",
        },
      }
    );

    console.log(
      `[Meta Data Deletion] Deleted ${deleted.deletedCount} Meta accounts for user ${metaUserId}`
    );

    // Audit log (best-effort, no teamId available from Meta callback)
    try {
      await logAudit({
        teamId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        userId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        action:      "store.disconnected",
        description: `Meta data deletion callback received for user ${metaUserId}`,
        resourceType: "AdAccount",
        resourceId:   metaUserId,
        metadata:     { platform: "meta", metaUserId, deletedCount: deleted.deletedCount },
      });
    } catch {
      // Non-fatal — audit failure must not break the deletion response
    }
  } catch (err) {
    console.error("[Meta Data Deletion] DB error:", err);
    // Still return success to Meta — we log internally and handle manually
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
