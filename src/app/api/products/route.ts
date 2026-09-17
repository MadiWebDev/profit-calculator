import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkSubscription } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import ProductModel from "@/models/Product";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

// ── GET /api/products ─────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const block = await checkSubscription(user.teamId);
  if (block) return block;

  await connectDB();
  const products = await ProductModel.find({ teamId: user.teamId, isActive: true })
    .sort({ totalProfit: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({
    products: products.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      sku: p.sku,
      defaultCogs: p.defaultCogs,
      currency: p.currency,
      imageUrl: p.imageUrl,
      totalRevenue: p.totalRevenue,
      totalCogs: p.totalCogs,
      totalProfit: p.totalProfit,
      totalOrders: p.totalOrders,
      avgProfitMargin: p.avgProfitMargin,
    })),
  });
}

// ── POST /api/products ────────────────────────────────────────────────────────
// Creates a manually-entered product (not linked to a store sync).
// Body: { name, sku?, defaultCogs?, currency?, imageUrl? }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string; role?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const block = await checkSubscription(user.teamId);
  if (block) return block;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Product name is required" }, { status: 422 });

  const defaultCogs = typeof body.defaultCogs === "number" && body.defaultCogs >= 0 ? body.defaultCogs : 0;
  const sku = typeof body.sku === "string" ? body.sku.trim() : undefined;
  const currency = typeof body.currency === "string" ? body.currency : "USD";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : undefined;

  await connectDB();

  // Prevent duplicate SKU within the same team
  if (sku) {
    const exists = await ProductModel.findOne({ teamId: user.teamId, sku });
    if (exists) {
      return NextResponse.json({ error: "A product with this SKU already exists" }, { status: 409 });
    }
  }

  const product = await ProductModel.create({
    teamId: user.teamId,
    // Manual products have no storeId — use a synthetic ObjectId placeholder
    storeId: new mongoose.Types.ObjectId("000000000000000000000000"),
    name,
    sku: sku || undefined,
    defaultCogs,
    currency,
    imageUrl: imageUrl || undefined,
    isActive: true,
  });

  await logAudit({
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id!),
    action: "product.created",
    description: `Created product "${name}"${sku ? ` (SKU: ${sku})` : ""}`,
    resourceType: "Product",
    resourceId: product._id.toString(),
  });

  return NextResponse.json(
    {
      product: {
        id: product._id.toString(),
        name: product.name,
        sku: product.sku,
        defaultCogs: product.defaultCogs,
        currency: product.currency,
        imageUrl: product.imageUrl,
        totalRevenue: 0,
        totalCogs: 0,
        totalProfit: 0,
        totalOrders: 0,
        avgProfitMargin: 0,
      },
    },
    { status: 201 }
  );
}
