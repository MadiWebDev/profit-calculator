import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import ProductModel from "@/models/Product";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";

const CreateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(100).optional(),
    defaultCogs: z.number().min(0).max(1_000_000_000).default(0),
    currency: z.string().length(3).toUpperCase().default("USD"),
    imageUrl: z.string().trim().url().max(2048).optional(),
  })
  .strict();

// ── GET /api/products ─────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "products-get" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  await connectDB();
  const products = await ProductModel.find({ teamId: toObjectId(session.teamId), isActive: true })
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
export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "products-post", permission: "write:data" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, CreateProductSchema);
  if ("response" in parsed) return parsed.response;
  const { name, sku, defaultCogs, currency, imageUrl } = parsed.data;

  try {
    await connectDB();

    // Prevent duplicate SKU within the same team
    if (sku) {
      const exists = await ProductModel.findOne({ teamId: toObjectId(session.teamId), sku })
        .select("_id")
        .lean();
      if (exists) {
        return fail("A product with this SKU already exists", 409, "DUPLICATE_SKU");
      }
    }

    const product = await ProductModel.create({
      teamId: toObjectId(session.teamId),
      // Manual products have no storeId — use a synthetic placeholder
      storeId: toObjectId("000000000000000000000000"),
      name,
      sku: sku || undefined,
      defaultCogs,
      currency,
      imageUrl: imageUrl || undefined,
      isActive: true,
    });

    try {
      await logAudit({
        teamId: toObjectId(session.teamId),
        userId: toObjectId(session.userId),
        action: "product.created",
        description: `Created product "${name}"${sku ? ` (SKU: ${sku})` : ""}`,
        resourceType: "Product",
        resourceId: product._id.toString(),
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

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
  } catch (err) {
    logger.error("product create failed", toLogError(err), { teamId: session.teamId });
    return fail("Failed to create product", 500, "PRODUCT_CREATE_FAILED");
  }
}
