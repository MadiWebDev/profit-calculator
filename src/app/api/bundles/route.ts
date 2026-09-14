import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import BundleModel from "@/models/Bundle";
import { Types } from "mongoose";

interface ComponentInput {
  productId?: string;
  name: string;
  cogs: number;
  quantity: number;
}

const DEFAULT_FEES_PCT = 5;

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeBundle(components: ComponentInput[], sellingPrice: number, feesPct = DEFAULT_FEES_PCT) {
  const totalCogs = components.reduce((s, c) => s + c.cogs * c.quantity, 0);
  const grossProfit = sellingPrice - totalCogs;
  const grossMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;
  const fees = (sellingPrice * feesPct) / 100;
  const netProfit = grossProfit - fees;
  const netMarginEstimate = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  return {
    totalCogs: round2(totalCogs),
    grossMargin: round2(grossMargin),
    netMarginEstimate: round2(netMarginEstimate),
  };
}

function validateComponents(components: unknown): components is ComponentInput[] {
  if (!Array.isArray(components) || components.length === 0) return false;
  return components.every(
    (c) =>
      c &&
      typeof c.name === "string" &&
      c.name.trim().length > 0 &&
      Number.isFinite(Number(c.cogs)) &&
      Number(c.cogs) >= 0 &&
      Number.isFinite(Number(c.quantity)) &&
      Number(c.quantity) > 0
  );
}

/** Coerce a component row: parse numeric strings, fill missing productId */
function normalizeComponent(c: ComponentInput): ComponentInput {
  return {
    productId: c.productId?.trim() || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:      c.name.trim(),
    cogs:      Math.max(0, Number(c.cogs) || 0),
    quantity:  Math.max(1, Math.round(Number(c.quantity) || 1)),
  };
}

function validateSellingPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price >= 0;
}

// Whitelist — never spread a client-supplied `updates` object straight into $set.
const PATCHABLE_FIELDS = ["name", "sku", "sellingPrice", "components", "currency", "storeId"] as const;

export async function GET(req: Request) {
  try {
    const result = await requireAuth(req);
    if (result instanceof Response) return result;
    const { session } = result;

    await connectDB();
    const bundles = await BundleModel.find({ teamId: session.teamId, isActive: true }).lean();
    return NextResponse.json({ bundles });
  } catch (err) {
    console.error("Bundle list error:", err);
    return NextResponse.json({ error: "Failed to load bundles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  try {
    const { storeId, name, sku, sellingPrice, components, currency } = await req.json();

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!validateComponents(components)) {
      return NextResponse.json(
        { error: "components must be a non-empty array of { name, cogs >= 0, quantity > 0 }" },
        { status: 400 }
      );
    }
    if (sellingPrice !== undefined && !validateSellingPrice(sellingPrice)) {
      return NextResponse.json({ error: "sellingPrice must be a non-negative number" }, { status: 400 });
    }
    if (storeId !== undefined && storeId !== null && !Types.ObjectId.isValid(storeId)) {
      return NextResponse.json({ error: "invalid storeId" }, { status: 400 });
    }

    const price = sellingPrice ?? 0;
    const normalizedComponents = components.map(normalizeComponent);
    const { totalCogs, grossMargin, netMarginEstimate } = computeBundle(normalizedComponents, price);

    await connectDB();
    const bundle = await BundleModel.create({
      teamId: session.teamId,
      storeId: storeId ?? undefined,
      name: name.trim(),
      sku: typeof sku === "string" ? sku.trim() : undefined,
      sellingPrice: price,
      components: normalizedComponents,
      totalCogs,
      grossMargin,
      netMarginEstimate,
      currency: currency ?? "USD",
      isActive: true,
    });

    return NextResponse.json({ id: bundle._id.toString() }, { status: 201 });
  } catch (err) {
    console.error("Bundle create error:", err);
    return NextResponse.json({ error: "Failed to create bundle" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  try {
    const body = await req.json();
    const { id } = body;

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "valid id required" }, { status: 400 });
    }

    // Whitelist to prevent mass-assignment (e.g. teamId, isActive, totalCogs).
    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
    }
    if (updates.components !== undefined && !validateComponents(updates.components)) {
      return NextResponse.json(
        { error: "components must be a non-empty array of { name, cogs >= 0, quantity > 0 }" },
        { status: 400 }
      );
    }
    // Normalize component numbers/productIds before saving
    if (updates.components !== undefined) {
      updates.components = (updates.components as ComponentInput[]).map(normalizeComponent);
    }
    if (updates.sellingPrice !== undefined && !validateSellingPrice(updates.sellingPrice)) {
      return NextResponse.json({ error: "sellingPrice must be a non-negative number" }, { status: 400 });
    }
    if (updates.storeId !== undefined && updates.storeId !== null && !Types.ObjectId.isValid(updates.storeId as string)) {
      return NextResponse.json({ error: "invalid storeId" }, { status: 400 });
    }

    await connectDB();

    // Recompute margins whenever EITHER input changes, falling back to the stored value
    // for whichever field wasn't part of this update.
    if (updates.components !== undefined || updates.sellingPrice !== undefined) {
      const existing = await BundleModel.findOne({ _id: id, teamId: session.teamId }).lean();
      if (!existing) {
        return NextResponse.json({ error: "bundle not found" }, { status: 404 });
      }
      const components = (updates.components as ComponentInput[]) ?? existing.components;
      const sellingPrice = (updates.sellingPrice as number) ?? existing.sellingPrice;
      Object.assign(updates, computeBundle(components, sellingPrice));
    }

    const updated = await BundleModel.findOneAndUpdate(
      { _id: id, teamId: session.teamId },
      { $set: updates },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ error: "bundle not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Bundle update error:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const result = await requireAuth(req);
    if (result instanceof Response) return result;
    const { session } = result;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "valid id required" }, { status: 400 });
    }

    await connectDB();
    const updated = await BundleModel.findOneAndUpdate(
      { _id: id, teamId: session.teamId },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ error: "bundle not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Bundle delete error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}