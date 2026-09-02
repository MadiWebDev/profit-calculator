import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import BundleModel from "@/models/Bundle";
import mongoose from "mongoose";

function computeBundle(components: { cogs: number; quantity: number }[], sellingPrice: number, feesPct = 5) {
  const totalCogs = components.reduce((s, c) => s + c.cogs * c.quantity, 0);
  const grossProfit = sellingPrice - totalCogs;
  const grossMargin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;
  const fees = (sellingPrice * feesPct) / 100;
  const netProfit = grossProfit - fees;
  const netMarginEstimate = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  return { totalCogs, grossMargin, netMarginEstimate };
}

export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  await connectDB();
  const bundles = await BundleModel.find({ teamId: session.teamId, isActive: true }).lean();
  return NextResponse.json({ bundles });
}

export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  try {
    const { storeId, name, sku, sellingPrice, components, currency } = await req.json();
    // storeId is optional — bundles can be team-level without a specific store
    if (!name || !components?.length) {
      return NextResponse.json({ error: "name and components are required" }, { status: 400 });
    }

    const { totalCogs, grossMargin, netMarginEstimate } = computeBundle(components, sellingPrice ?? 0);

    await connectDB();
    const bundle = await BundleModel.create({
      teamId: session.teamId, storeId, name, sku, sellingPrice,
      components, totalCogs, grossMargin, netMarginEstimate,
      currency: currency ?? "USD",
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
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (updates.components && updates.sellingPrice !== undefined) {
      const computed = computeBundle(updates.components, updates.sellingPrice);
      Object.assign(updates, computed);
    }

    await connectDB();
    await BundleModel.findOneAndUpdate(
      { _id: id, teamId: session.teamId },
      { $set: updates }
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Bundle update error:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await connectDB();
  await BundleModel.findOneAndUpdate({ _id: id, teamId: session.teamId }, { isActive: false });
  return NextResponse.json({ success: true });
}
