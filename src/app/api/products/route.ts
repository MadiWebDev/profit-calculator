import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import ProductModel from "@/models/Product";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import { deriveMoneyCurrency } from "@/lib/money-currency-server";
import { getComputedProductAggregates } from "@/lib/product-aggregates-server";
import {
  avgPriceInCurrency,
  emptyProductAggregate,
  lookupProductAggregate,
} from "@/lib/product-aggregates";

const CreateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(100).optional(),
    defaultCogs: z.number().min(0).max(1_000_000_000).default(0),
    // No silent USD default: when the client sends no currency, the
    // server derives it (user display currency > team > store).
    currency: z.string().length(3).toUpperCase().optional(),
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
    .limit(200)
    .lean();

  // The stored Product aggregates (totalRevenue/totalOrders/…) are
  // never written anywhere, so they are always 0 — compute them from
  // the team's orders at read time instead (see
  // src/lib/product-aggregates.ts). The stored fields stay in the
  // model as a fallback but are no longer read for display.
  const { aggregates, baseCurrency, rates } = await getComputedProductAggregates(session.teamId);

  const withAggregates = products.map((p) => {
    const agg =
      lookupProductAggregate(aggregates, {
        externalId: p.externalId,
        sku: p.sku,
        name: p.name,
      }) ?? emptyProductAggregate(p._id.toString(), p.name);
    return {
      id: p._id.toString(),
      name: p.name,
      sku: p.sku,
      defaultCogs: p.defaultCogs,
      currency: p.currency,
      imageUrl: p.imageUrl,
      totalRevenue: agg.totalRevenue,
      totalCogs: agg.totalCogs,
      totalProfit: agg.totalProfit,
      totalOrders: agg.totalOrders,
      avgProfitMargin: agg.avgProfitMargin,
      avgPrice: agg.avgPrice,
      // The average price expressed in THIS product's own currency, for
      // COGS writes (defaultCogs is stored in product currency). Null
      // when the price cannot be converted (FX unavailable) and the
      // product currency differs from base — callers must skip the
      // write then, never store the base-denominated number as COGS.
      avgPriceInProductCurrency: avgPriceInCurrency(agg.avgPrice, baseCurrency, p.currency, rates),
    };
  });

  // Sort by COMPUTED profit (the old DB sort on the stored, always-0
  // totalProfit was meaningless).
  withAggregates.sort((a, b) => b.totalProfit - a.totalProfit);

  return NextResponse.json({ products: withAggregates });
}

// ── POST /api/products ────────────────────────────────────────────────────────
// Creates a manually-entered product (not linked to a store sync).
export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "products-post", permission: "write:data" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, CreateProductSchema);
  if ("response" in parsed) return parsed.response;
  const { name, sku, defaultCogs, imageUrl } = parsed.data;

  try {
    await connectDB();
    const currency =
      parsed.data.currency ??
      (await deriveMoneyCurrency({ userId: session.userId, teamId: session.teamId }));
    if (!currency) {
      return fail("Currency is required — set a display currency, a team currency, or connect a store", 400, "CURRENCY_REQUIRED");
    }

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
