import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkSubscription } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import ProductModel from "@/models/Product";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

// ── PATCH /api/products/[id] ──────────────────────────────────────────────────
// Allows updating: name, sku, defaultCogs, imageUrl, currency, isActive
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string; role?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const block = await checkSubscription(user.teamId);
  if (block) return block;

  const { id } = await params;
  const body = await req.json();

  await connectDB();
  const product = await ProductModel.findOne({ _id: id, teamId: user.teamId });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowedFields = ["defaultCogs", "name", "sku", "imageUrl", "currency", "isActive"] as const;
  const changes: string[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      // Validate types for critical fields
      if (field === "defaultCogs" && (typeof body[field] !== "number" || body[field] < 0)) continue;
      if (field === "name" && (typeof body[field] !== "string" || !body[field].trim())) continue;
      product.set(field, field === "name" ? body[field].trim() : body[field]);
      changes.push(field);
    }
  }

  await product.save();

  // Build a human-readable audit description
  const cogsChanged = changes.includes("defaultCogs");
  const description = cogsChanged
    ? `Updated product "${product.name}" COGS to $${product.defaultCogs}`
    : `Updated product "${product.name}" fields: ${changes.join(", ")}`;

  await logAudit({
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id!),
    action: "product.cogs_updated",
    description,
    resourceType: "Product",
    resourceId: id,
    metadata: { changes },
  });

  return NextResponse.json({ success: true, product: { id, ...Object.fromEntries(changes.map((f) => [f, product.get(f)])) } });
}

// ── DELETE /api/products/[id] ─────────────────────────────────────────────────
// Soft-deletes the product (sets isActive: false) so historical data is preserved.
// Only owner and admin can delete.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string; role?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const block = await checkSubscription(user.teamId);
  if (block) return block;

  const { id } = await params;

  await connectDB();
  const product = await ProductModel.findOne({ _id: id, teamId: user.teamId });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete: preserve historical profit data tied to this product
  product.isActive = false;
  await product.save();

  await logAudit({
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id!),
    action: "product.deleted",
    description: `Deleted product "${product.name}"${product.sku ? ` (SKU: ${product.sku})` : ""}`,
    resourceType: "Product",
    resourceId: id,
  });

  return NextResponse.json({ success: true });
}
