/**
 * GET /api/couriers — team couriers (API keys never returned, only
 * hasApiKey). POST — create a courier with an optional encrypted API
 * key. Phase 6.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import CourierModel from "@/models/Courier";
import { encrypt } from "@/lib/encryption";

const CreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    adapter: z.string().trim().min(1).max(50).default("generic"),
    apiKey: z.string().min(1).max(500).optional(),
    apiBaseUrl: z.string().url().max(500).optional(),
    storeId: z.string().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "couriers");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  await connectDB();
  const rows = await CourierModel.find({ teamId: toObjectId(session.teamId) })
    .sort({ name: 1 })
    .lean();
  return NextResponse.json({
    couriers: rows.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      adapter: c.adapter,
      apiBaseUrl: c.apiBaseUrl ?? null,
      hasApiKey: Boolean(c.apiKey),
      isActive: c.isActive,
      createdAt: c.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "couriers-post");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const { name, adapter, apiKey, apiBaseUrl, storeId } = parsed.data;
  await connectDB();
  try {
    const created = await CourierModel.create({
      teamId: toObjectId(session.teamId),
      ...(storeId ? { storeId: toObjectId(storeId) } : {}),
      name,
      adapter,
      apiKey: apiKey ? encrypt(apiKey) : null,
      apiBaseUrl,
    });
    return NextResponse.json(
      { id: created._id.toString(), name, adapter, hasApiKey: Boolean(apiKey), isActive: true },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "A courier with this name already exists", code: "DUPLICATE" },
      { status: 409 }
    );
  }
}
