import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

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
    console.error("[Meta Deauth] META_APP_SECRET not configured");
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
    console.error("[Meta Deauth] Invalid signature");
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
  try {
    await connectDB();

    await AdAccountModel.updateMany(
      { platform: "meta", metaUserId },
      {
        $set: {
          accessToken:  null,
          refreshToken: null,
          isActive:     false,
          syncStatus:   "deauthorized",
        },
      }
    );

    console.log(`[Meta Deauth] Deauthorized Meta accounts for user ${metaUserId}`);

    try {
      await logAudit({
        teamId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        userId:      new mongoose.Types.ObjectId("000000000000000000000000"),
        action:      "store.disconnected",
        description: `Meta deauthorize callback received for user ${metaUserId}`,
        resourceType: "AdAccount",
        resourceId:   metaUserId,
        metadata:     { platform: "meta", metaUserId },
      });
    } catch {
      // Non-fatal
    }
  } catch (err) {
    console.error("[Meta Deauth] DB error:", err);
  }

  return NextResponse.json({ success: true });
}
