import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, objectIdString, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import BundleModel from "@/models/Bundle";
import { logger, toLogError } from "@/lib/logger";
import { calcBundleMargin } from "@/lib/profit-engine";

const DEFAULT_FEES_PCT = 5;

const ComponentSchema = z
  .object({
    productId: z.string().trim().max(200).optional(),
    name: z.string().trim().min(1).max(300),
    cogs: z.number().min(0).max(1_000_000_000),
    quantity: z.number().int().min(1).max(1_000_000),
  })
  .strict();

type ComponentInput = z.infer<typeof ComponentSchema>;

const CreateBundleSchema = z
  .object({
    storeId: objectIdString("storeId").optional(),
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(100).optional(),
    sellingPrice: z.number().min(0).max(1_000_000_000).default(0),
    components: z.array(ComponentSchema).min(1).max(200),
    currency: z.string().length(3).toUpperCase().default("USD"),
  })
  .strict();

const PatchBundleSchema = z
  .object({
    id: objectIdString("id"),
    name: z.string().trim().min(1).max(200).optional(),
    sku: z.string().trim().max(100).optional(),
    sellingPrice: z.number().min(0).max(1_000_000_000).optional(),
    components: z.array(ComponentSchema).min(1).max(200).optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    storeId: objectIdString("storeId").nullable().optional(),
  })
  .strict();

/**
 * Bundle margin via the shared profit engine (single source of truth).
 * Keeps the route's { totalCogs, grossMargin, netMarginEstimate } shape.
 */
function computeBundle(components: ComponentInput[], sellingPrice: number, feesPct = DEFAULT_FEES_PCT) {
  const m = calcBundleMargin(components, sellingPrice, feesPct);
  return {
    totalCogs: m.totalCogs,
    grossMargin: m.grossMargin,
    netMarginEstimate: m.netMargin,
  };
}

/** Fill missing productId for manual components */
function normalizeComponent(c: ComponentInput): ComponentInput {
  return {
    ...c,
    productId: c.productId?.trim() || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "bundles-get" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  try {
    await connectDB();
    const bundles = await BundleModel.find({ teamId: toObjectId(session.teamId), isActive: true }).lean();
    return NextResponse.json({ bundles });
  } catch (err) {
    logger.error("bundle list failed", toLogError(err), { teamId: session.teamId });
    return fail("Failed to load bundles", 500, "BUNDLE_LIST_FAILED");
  }
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "bundles-post", permission: "write:data" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, CreateBundleSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;

  try {
    const normalizedComponents = b.components.map(normalizeComponent);
    const { totalCogs, grossMargin, netMarginEstimate } = computeBundle(normalizedComponents, b.sellingPrice);

    await connectDB();
    const bundle = await BundleModel.create({
      teamId: toObjectId(session.teamId),
      storeId: b.storeId ? toObjectId(b.storeId) : undefined,
      name: b.name,
      sku: b.sku,
      sellingPrice: b.sellingPrice,
      components: normalizedComponents,
      totalCogs,
      grossMargin,
      netMarginEstimate,
      currency: b.currency,
      isActive: true,
    });

    return NextResponse.json({ id: bundle._id.toString() }, { status: 201 });
  } catch (err) {
    logger.error("bundle create failed", toLogError(err), { teamId: session.teamId });
    return fail("Failed to create bundle", 500, "BUNDLE_CREATE_FAILED");
  }
}

export async function PATCH(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "bundles-patch", permission: "write:data" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, PatchBundleSchema);
  if ("response" in parsed) return parsed.response;
  const { id, ...fields } = parsed.data;

  // Whitelist — never spread client fields straight into $set beyond the schema
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) updates[k] = v;
  }
  if (updates.components !== undefined) {
    updates.components = (updates.components as ComponentInput[]).map(normalizeComponent);
  }
  if (updates.storeId !== undefined) {
    updates.storeId = updates.storeId ? toObjectId(updates.storeId as string) : null;
  }
  if (Object.keys(updates).length === 0) {
    return fail("No valid fields to update", 400, "VALIDATION_ERROR");
  }

  try {
    await connectDB();

    // Recompute margins whenever EITHER input changes
    if (updates.components !== undefined || updates.sellingPrice !== undefined) {
      const existing = await BundleModel.findOne({
        _id: toObjectId(id),
        teamId: toObjectId(session.teamId),
      }).lean();
      if (!existing) return fail("Bundle not found", 404, "BUNDLE_NOT_FOUND");
      const components = (updates.components as ComponentInput[]) ?? existing.components;
      const sellingPrice = (updates.sellingPrice as number) ?? existing.sellingPrice;
      Object.assign(updates, computeBundle(components, sellingPrice));
    }

    const updated = await BundleModel.findOneAndUpdate(
      { _id: toObjectId(id), teamId: toObjectId(session.teamId) },
      { $set: updates },
      { new: true }
    );
    if (!updated) return fail("Bundle not found", 404, "BUNDLE_NOT_FOUND");

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("bundle update failed", toLogError(err), { teamId: session.teamId });
    return fail("Update failed", 500, "BUNDLE_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "bundles-delete", permission: "write:data" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !objectIdString("id").safeParse(id).success) {
    return fail("Valid id query param required", 400, "VALIDATION_ERROR");
  }

  try {
    await connectDB();
    const updated = await BundleModel.findOneAndUpdate(
      { _id: toObjectId(id), teamId: toObjectId(session.teamId) },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!updated) return fail("Bundle not found", 404, "BUNDLE_NOT_FOUND");
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("bundle delete failed", toLogError(err), { teamId: session.teamId });
    return fail("Delete failed", 500, "BUNDLE_DELETE_FAILED");
  }
}
