import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";
import { logger } from "@/lib/logger";

/**
 * POST /api/ad-accounts/meta/deauthorize
 *
 * Meta calls this endpoint when a user deauthorizes your app
 * (removes it from their Facebook apps settings).
 * We revoke and clear stored tokens for that Meta user.
 *
 * Meta Deauthorize Callback docs:
 *  https://developers.facebook.com/docs/facebook-login/guides/advanced/deauthorize-callback
 */
export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    logger.error("[Meta Deauth] META_APP_SECRET not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  // ── 1. Parse the signed_request ───────────────────────────────────────────
  let signedRequest: string | null = null;

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      signedRequest = params.get("signed_request");
    } else {
      const body = await req.json();
      signedRequest = body.signed_request ?? null;
    }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!signedRequest) {
    return NextResponse.json({ error: "missing_signed_request" }, { status: 400 });
  }

  // ── 2. Verify signature ───────────────────────────────────────────────────
  const parts = signedRequest.split(".");
  if (parts.length !== 2) {
    return NextResponse.json({ error: "malformed_signed_request" }, { status: 400 });
  }

  const [encodedSig, encodedPayload] = parts;

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();

  const receivedSig = Buffer.from(
    encodedSig.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  if (!crypto.timingSafeEqual(expectedSig, receivedSig)) {
    logger.error("[Meta Deauth] Invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  // ── 3. Parse payload ──────────────────────────────────────────────────────
  let payload: { user_id?: string };

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

  // ── 4. Revoke tokens for this Meta user ───────────────────────────────────
  // F11: this used to query a `metaUserId` field the schema did not
  // have, so the query could never match — yet the route still
  // returned { success: true } to Meta. The field now exists on the
  // schema, and when nothing matches we say so instead of confirming
  // a revocation that never happened.
  try {
    await connectDB();

    const revoked = await AdAccountModel.updateMany(
      { platform: "meta", metaUserId },
      {
        $set: {
          accessToken:  null,
          refreshToken: null,
          isActive:     false,
          syncStatus:   "disconnected",
        },
      }
    );

    if ((revoked.modifiedCount ?? 0) === 0 && (revoked.matchedCount ?? 0) === 0) {
      logger.warn("[Meta Deauth] No Meta accounts for user", { metaUserId });
      return NextResponse.json(
        { error: "no_matching_accounts", code: "NO_MATCHING_ACCOUNTS" },
        { status: 404 }
      );
    }

    logger.info("[Meta Deauth] Meta accounts deauthorized", {
      metaUserId,
      revokedCount: revoked.modifiedCount ?? 0,
    });

    try {
      await logAudit({
        teamId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        userId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        action:      "store.disconnected",
        description: `Meta deauthorize callback received for user ${metaUserId}`,
        resourceType: "AdAccount",
        resourceId:   metaUserId,
        metadata:     { platform: "meta", metaUserId, revokedCount: revoked.modifiedCount ?? 0 },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true, revokedCount: revoked.modifiedCount ?? 0 });
  } catch (err) {
    logger.error("[Meta Deauth] DB error", err);
    // Do NOT return success: Meta must know the revocation did not
    // happen so it can retry.
    return NextResponse.json(
      { error: "deauthorize_failed", code: "DEAUTHORIZE_FAILED" },
      { status: 500 }
    );
  }
}
