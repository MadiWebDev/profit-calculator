import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, parseQuery, fail, objectIdString, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import CogsRuleModel from "@/models/CogsRule";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";

const CogsQuerySchema = z
  .object({ storeId: objectIdString("storeId").optional() })
  .strict();

const MoneyField = z.number().min(0).max(1_000_000_000).default(0);

const UpsertCogsSchema = z
  .object({
    storeId: objectIdString("storeId"),
    productId: z.string().trim().min(1).max(200),
    variantId: z.string().trim().max(200).optional(),
    productName: z.string().trim().min(1).max(300),
    variantTitle: z.string().trim().max(300).optional(),
    sku: z.string().trim().max(100).optional(),
    supplierCost: MoneyField,
    shippingToWarehouse: MoneyField,
    importDuties: MoneyField,
    packagingCost: MoneyField,
    prepCost: MoneyField,
    otherLandedCost: MoneyField,
    currency: z.string().length(3).toUpperCase().default("USD"),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const BulkCogsSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            id: objectIdString("id"),
            cogs: z.number().min(0).max(1_000_000_000),
            note: z.string().trim().max(500).optional(),
          })
          .strict()
      )
      .min(1)
      .max(500),
  })
  .strict();

// GET /api/cogs?storeId=xxx
export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "cogs-get" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const q = parseQuery(req, CogsQuerySchema);
  if ("response" in q) return q.response;

  await connectDB();
  const query: Record<string, unknown> = { teamId: toObjectId(session.teamId) };
  if (q.data.storeId) query.storeId = toObjectId(q.data.storeId);

  const rules = await CogsRuleModel.find(query).sort({ productName: 1 }).lean();
  return NextResponse.json({ rules });
}

// POST /api/cogs — create or upsert a COGS rule (edit:cogs)
export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "cogs-post", permission: "edit:cogs" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, UpsertCogsSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;

  const cogs =
    b.supplierCost + b.shippingToWarehouse + b.importDuties +
    b.packagingCost + b.prepCost + b.otherLandedCost;

  try {
    await connectDB();

    const historyEntry = {
      cogs,
      effectiveFrom: new Date(),
      updatedBy: toObjectId(session.userId),
      note: b.note,
    };

    const rule = await CogsRuleModel.findOneAndUpdate(
      {
        teamId: toObjectId(session.teamId),
        storeId: toObjectId(b.storeId),
        productId: b.productId,
        variantId: b.variantId || null,
      },
      {
        $set: {
          teamId: toObjectId(session.teamId),
          storeId: toObjectId(b.storeId),
          productId: b.productId,
          variantId: b.variantId,
          productName: b.productName,
          variantTitle: b.variantTitle,
          sku: b.sku,
          cogs,
          supplierCost: b.supplierCost,
          shippingToWarehouse: b.shippingToWarehouse,
          importDuties: b.importDuties,
          packagingCost: b.packagingCost,
          prepCost: b.prepCost,
          otherLandedCost: b.otherLandedCost,
          currency: b.currency,
          applyToNewOrders: true,
        },
        $push: { history: { $each: [historyEntry], $slice: -50 } }, // keep last 50
      },
      { upsert: true, new: true }
    );

    try {
      await logAudit({
        teamId: toObjectId(session.teamId),
        userId: toObjectId(session.userId),
        action: "product.cogs_updated",
        description: `COGS rule set for "${b.productName}"${b.variantTitle ? ` (${b.variantTitle})` : ""}: $${cogs.toFixed(2)}`,
        resourceType: "CogsRule",
        resourceId: rule._id.toString(),
        metadata: { cogs, note: b.note },
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json({ id: rule._id.toString(), cogs }, { status: 201 });
  } catch (err) {
    logger.error("COGS upsert failed", toLogError(err), { teamId: session.teamId });
    return fail("Failed to save COGS rule", 500, "COGS_UPSERT_FAILED");
  }
}

// PATCH /api/cogs — bulk update multiple rules at once (edit:cogs)
export async function PATCH(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "cogs-patch", permission: "edit:cogs" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, BulkCogsSchema);
  if ("response" in parsed) return parsed.response;

  try {
    await connectDB();
    // Mongoose's bulkWrite typings reject $push+$each+$slice on typed models
    // (same workaround as src/app/api/v1/cogs/route.ts).
    const ops = parsed.data.rules.map(({ id, cogs, note }) => ({
      updateOne: {
        filter: { _id: toObjectId(id), teamId: toObjectId(session.teamId) },
        update: {
          $set: { cogs },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $push: { history: { $each: [{ cogs, effectiveFrom: new Date(), updatedBy: toObjectId(session.userId), note }], $slice: -50 } } as any,
        },
      },
    }));

    const res = await CogsRuleModel.bulkWrite(ops);

    try {
      await logAudit({
        teamId: toObjectId(session.teamId),
        userId: toObjectId(session.userId),
        action: "product.cogs_updated",
        description: `Bulk COGS update: ${res.modifiedCount} rules updated`,
        metadata: { updatedCount: res.modifiedCount },
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json({ updated: res.modifiedCount });
  } catch (err) {
    logger.error("bulk COGS failed", toLogError(err), { teamId: session.teamId });
    return fail("Bulk update failed", 500, "COGS_BULK_FAILED");
  }
}
