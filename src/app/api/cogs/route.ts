import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import CogsRuleModel from "@/models/CogsRule";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

// GET /api/cogs?storeId=xxx
export async function GET(req: Request) {
  const result = await requireAuth(req, { rateLimitKey: "cogs-get" });
  if (result instanceof Response) return result;
  const { session } = result;

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");

  await connectDB();
  const query: Record<string, unknown> = { teamId: session.teamId };
  if (storeId) query.storeId = storeId;

  const rules = await CogsRuleModel.find(query).sort({ productName: 1 }).lean();
  return NextResponse.json({ rules });
}

// POST /api/cogs — create or upsert a COGS rule
export async function POST(req: Request) {
  const result = await requireAuth(req, { rateLimitKey: "cogs-post" });
  if (result instanceof Response) return result;
  const { session } = result;

  try {
    const body = await req.json();
    const {
      storeId, productId, variantId, productName, variantTitle, sku,
      supplierCost = 0, shippingToWarehouse = 0, importDuties = 0,
      packagingCost = 0, prepCost = 0, otherLandedCost = 0,
      currency = "USD", note,
    } = body;

    if (!storeId || !productId || !productName) {
      return NextResponse.json({ error: "storeId, productId, productName are required" }, { status: 400 });
    }

    const cogs = supplierCost + shippingToWarehouse + importDuties + packagingCost + prepCost + otherLandedCost;

    await connectDB();

    const historyEntry = {
      cogs,
      effectiveFrom: new Date(),
      updatedBy: new mongoose.Types.ObjectId(session.userId),
      note,
    };

    const rule = await CogsRuleModel.findOneAndUpdate(
      { teamId: session.teamId, storeId, productId, variantId: variantId || null },
      {
        $set: {
          teamId: session.teamId, storeId, productId, variantId,
          productName, variantTitle, sku, cogs,
          supplierCost, shippingToWarehouse, importDuties,
          packagingCost, prepCost, otherLandedCost,
          currency, applyToNewOrders: true,
        },
        $push: { history: { $each: [historyEntry], $slice: -50 } }, // keep last 50
      },
      { upsert: true, new: true }
    );

    await logAudit({
      teamId: new mongoose.Types.ObjectId(session.teamId),
      userId: new mongoose.Types.ObjectId(session.userId),
      action: "product.cogs_updated",
      description: `COGS rule set for "${productName}" ${variantTitle ? `(${variantTitle})` : ""}: $${cogs.toFixed(2)}`,
      resourceType: "CogsRule",
      resourceId: rule._id.toString(),
      metadata: { cogs, supplierCost, shippingToWarehouse, importDuties, note },
    });

    return NextResponse.json({ id: rule._id.toString(), cogs }, { status: 201 });
  } catch (err) {
    console.error("COGS upsert error:", err);
    return NextResponse.json({ error: "Failed to save COGS rule" }, { status: 500 });
  }
}

// PATCH /api/cogs — bulk update multiple rules at once
export async function PATCH(req: Request) {
  const result = await requireAuth(req, { rateLimitKey: "cogs-patch" });
  if (result instanceof Response) return result;
  const { session } = result;

  try {
    const { rules } = await req.json() as { rules: { id: string; cogs: number; note?: string }[] };
    if (!Array.isArray(rules) || !rules.length) {
      return NextResponse.json({ error: "rules array is required" }, { status: 400 });
    }

    await connectDB();
    const ops = rules.map(({ id, cogs, note }: { id: string; cogs: number; note?: string }) => ({
      updateOne: {
        filter: { _id: id, teamId: session.teamId },
        update: {
          $set: { cogs },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $push: { history: { $each: [{ cogs, effectiveFrom: new Date(), updatedBy: new mongoose.Types.ObjectId(session.userId), note }], $slice: -50 } } as any,
        },
      },
    }));

    const res = await CogsRuleModel.bulkWrite(ops);

    await logAudit({
      teamId: new mongoose.Types.ObjectId(session.teamId),
      userId: new mongoose.Types.ObjectId(session.userId),
      action: "product.cogs_updated",
      description: `Bulk COGS update: ${res.modifiedCount} rules updated`,
      metadata: { updatedCount: res.modifiedCount },
    });

    return NextResponse.json({ updated: res.modifiedCount });
  } catch (err) {
    console.error("Bulk COGS error:", err);
    return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
  }
}
