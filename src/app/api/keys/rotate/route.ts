import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { fail, objectIdString, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { withRateLimit } from "@/lib/rate-limit";
import { generateApiKey } from "@/lib/api-key-auth";
import { connectDB } from "@/lib/db";
import ApiKeyModel from "@/models/ApiKey";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";

/**
 * POST /api/keys/rotate?id=… — rotate an API key.
 *
 * Revokes the old key and issues a replacement with the same name, scopes
 * and expiry. The raw replacement key is returned ONCE.
 * Permission: manage:apikeys. Plan: api.access (Pro).
 */
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "strict", "keys-rotate");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "manage:apikeys" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const ent = await checkEntitlement(session.teamId, "api.access");
  if ("response" in ent) return ent.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !objectIdString("id").safeParse(id).success) {
    return fail("Valid id query param required", 400, "VALIDATION_ERROR");
  }

  await connectDB();
  const old = await ApiKeyModel.findOne({
    _id: toObjectId(id),
    teamId: toObjectId(session.teamId),
    isActive: true,
  });
  if (!old) return fail("API key not found", 404, "KEY_NOT_FOUND");

  const { rawKey, keyHash, prefix } = generateApiKey();

  old.isActive = false;
  await old.save();

  const replacement = await ApiKeyModel.create({
    teamId: toObjectId(session.teamId),
    createdBy: toObjectId(session.userId),
    name: old.name,
    keyHash,
    keyPrefix: prefix,
    scopes: old.scopes,
    expiresAt: old.expiresAt,
  });

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "api_key.revoked",
      description: `Rotated API key "${old.name}"`,
      resourceType: "ApiKey",
      resourceId: replacement._id.toString(),
      metadata: { rotatedFrom: id },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json(
    {
      id: replacement._id.toString(),
      name: replacement.name,
      key: rawKey, // ⚠️ shown once
      prefix,
      scopes: replacement.scopes,
      rotatedFrom: id,
    },
    { status: 201 }
  );
}
