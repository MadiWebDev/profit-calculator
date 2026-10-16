import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, objectIdString, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { withRateLimit } from "@/lib/rate-limit";
import { generateApiKey } from "@/lib/api-key-auth";
import { connectDB } from "@/lib/db";
import ApiKeyModel from "@/models/ApiKey";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";

const API_KEY_SCOPES = ["read:orders", "read:products", "read:reports", "write:cogs"] as const;

const CreateKeySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(4).default(["read:orders", "read:reports"]),
    // Expiry in days, 1–365. Omitted = no expiry (discouraged in UI).
    expiresInDays: z.number().int().min(1).max(365).optional(),
  })
  .strict();

/**
 * GET /api/keys — list keys for the team (metadata only, never hashes).
 * Permission: manage:apikeys. Plan: api.access (Pro).
 */
export async function GET(req: Request) {
  const rl = await withRateLimit(req, "strict", "keys-list");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "manage:apikeys" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const ent = await checkEntitlement(session.teamId, "api.access");
  if ("response" in ent) return ent.response;

  await connectDB();
  const keys = await ApiKeyModel.find({ teamId: toObjectId(session.teamId), isActive: true })
    .select("-keyHash")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ keys });
}

/**
 * POST /api/keys — create a new key. The raw key is returned ONCE and never
 * stored in plaintext (SHA-256 hash only).
 */
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "strict", "keys-create");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "manage:apikeys" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const ent = await checkEntitlement(session.teamId, "api.access");
  if ("response" in ent) return ent.response;

  const parsed = await parseBody(req, CreateKeySchema);
  if ("response" in parsed) return parsed.response;
  const { name, scopes, expiresInDays } = parsed.data;

  await connectDB();

  const existingCount = await ApiKeyModel.countDocuments({
    teamId: toObjectId(session.teamId),
    isActive: true,
  });
  if (existingCount >= 10) {
    return fail("Maximum 10 API keys per team. Revoke unused keys first.", 429, "KEY_LIMIT");
  }

  const { rawKey, keyHash, prefix } = generateApiKey();

  const apiKey = await ApiKeyModel.create({
    teamId: toObjectId(session.teamId),
    createdBy: toObjectId(session.userId),
    name,
    keyHash,
    keyPrefix: prefix,
    scopes,
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : undefined,
  });

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "api_key.created",
      description: `Created API key "${name}"`,
      resourceType: "ApiKey",
      resourceId: apiKey._id.toString(),
      metadata: { scopes },
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json(
    { id: apiKey._id.toString(), name, key: rawKey, prefix, scopes },
    { status: 201 }
  );
}

/**
 * DELETE /api/keys?id=… — revoke a key (soft delete; the hash stays for
 * audit but isActive=false rejects it).
 */
export async function DELETE(req: Request) {
  const rl = await withRateLimit(req, "strict", "keys-revoke");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "manage:apikeys" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !objectIdString("id").safeParse(id).success) {
    return fail("Valid id query param required", 400, "VALIDATION_ERROR");
  }

  await connectDB();
  const updated = await ApiKeyModel.findOneAndUpdate(
    { _id: toObjectId(id), teamId: toObjectId(session.teamId), isActive: true },
    { isActive: false }
  );
  if (!updated) return fail("API key not found", 404, "KEY_NOT_FOUND");

  try {
    await logAudit({
      teamId: toObjectId(session.teamId),
      userId: toObjectId(session.userId),
      action: "api_key.revoked",
      description: `Revoked API key "${updated.name}"`,
      resourceType: "ApiKey",
      resourceId: id,
    });
  } catch (e) {
    logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
  }

  return NextResponse.json({ success: true });
}
