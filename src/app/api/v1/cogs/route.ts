/**
 * Public API v1 — COGS endpoint
 *
 * GET    /api/v1/cogs                   List COGS rules for the team
 * POST   /api/v1/cogs                   Upsert a single COGS rule
 * PATCH  /api/v1/cogs                   Bulk-update COGS values by rule ID
 *
 * Auth: Authorization: Bearer pc_live_xxx
 * Required scope: write:cogs  (GET also accepts write:cogs — single scope covers all)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateApiKey, hasScope } from "@/lib/api-key-auth";
import { checkSubscription } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import CogsRuleModel from "@/models/CogsRule";
import mongoose from "mongoose";

// ─── Auth helper ────────────────────────────────────────────────────────────

async function auth(req: NextRequest) {
  const session = await validateApiKey(req);
  if (!session) {
    return {
      session: null,
      err: NextResponse.json(
        { error: "Unauthorized. Provide a valid API key in Authorization: Bearer <key>" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
      ),
    };
  }
  if (!hasScope(session, "write:cogs")) {
    return {
      session: null,
      err: NextResponse.json({ error: "Missing scope: write:cogs" }, { status: 403 }),
    };
  }

  // Subscription guard — archived accounts cannot use the API
  const block = await checkSubscription(session.teamId);
  if (block) return { session: null, err: block };

  return { session, err: null };
}

// ─── GET /api/v1/cogs ────────────────────────────────────────────────────────
//
// Query params:
//   storeId   (optional) filter by store ObjectId
//   page      (optional, default 1)
//   limit     (optional, default 50, max 200)

export async function GET(req: NextRequest) {
  const { session, err } = await auth(req);
  if (err) return err;

  const { searchParams } = req.nextUrl;
  const storeId = searchParams.get("storeId");
  const page    = Math.max(1, parseInt(searchParams.get("page")  ?? "1",   10));
  const limit   = Math.min(200, parseInt(searchParams.get("limit") ?? "50", 10));

  const query: Record<string, unknown> = {
    teamId: mongoose.Types.ObjectId.createFromHexString(session!.teamId),
  };
  if (storeId) {
    query.storeId = mongoose.Types.ObjectId.createFromHexString(storeId);
  }

  await connectDB();
  const [rules, total] = await Promise.all([
    CogsRuleModel.find(query)
      .select(
        "storeId productId variantId productName variantTitle sku " +
        "cogs supplierCost shippingToWarehouse importDuties " +
        "packagingCost prepCost otherLandedCost currency applyToNewOrders createdAt updatedAt"
      )
      .sort({ productName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CogsRuleModel.countDocuments(query),
  ]);

  return NextResponse.json({
    data: rules,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// ─── POST /api/v1/cogs ───────────────────────────────────────────────────────
//
// Upsert a COGS rule for a single product/variant.
// Body (JSON):
//   storeId              string  (required)
//   productId            string  (required)
//   productName          string  (required)
//   variantId?           string
//   variantTitle?        string
//   sku?                 string
//   supplierCost?        number  (default 0)
//   shippingToWarehouse? number  (default 0)
//   importDuties?        number  (default 0)
//   packagingCost?       number  (default 0)
//   prepCost?            number  (default 0)
//   otherLandedCost?     number  (default 0)
//   currency?            string  (default "USD")
//   note?                string

export async function POST(req: NextRequest) {
  const { session, err } = await auth(req);
  if (err) return err;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    storeId,
    productId,
    productName,
    variantId,
    variantTitle,
    sku,
    supplierCost      = 0,
    shippingToWarehouse = 0,
    importDuties      = 0,
    packagingCost     = 0,
    prepCost          = 0,
    otherLandedCost   = 0,
    currency          = "USD",
    note,
  } = body as Record<string, unknown>;

  // Validate required fields
  if (!storeId || typeof storeId !== "string") {
    return NextResponse.json({ error: "storeId is required" }, { status: 400 });
  }
  if (!productId || typeof productId !== "string") {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (!productName || typeof productName !== "string") {
    return NextResponse.json({ error: "productName is required" }, { status: 400 });
  }

  // Validate cost fields are numbers
  const costFields = { supplierCost, shippingToWarehouse, importDuties, packagingCost, prepCost, otherLandedCost };
  for (const [field, value] of Object.entries(costFields)) {
    if (typeof value !== "number" || value < 0) {
      return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
    }
  }

  const cogs =
    (supplierCost as number) +
    (shippingToWarehouse as number) +
    (importDuties as number) +
    (packagingCost as number) +
    (prepCost as number) +
    (otherLandedCost as number);

  // Use keyId as the "updatedBy" proxy for API-key-originated changes
  // keyId is the ApiKey document _id — a standard 24-char hex ObjectId
  const updatedBy = new mongoose.Types.ObjectId(session!.keyId);

  await connectDB();

  try {
    const rule = await CogsRuleModel.findOneAndUpdate(
      {
        teamId:    mongoose.Types.ObjectId.createFromHexString(session!.teamId),
        storeId:   mongoose.Types.ObjectId.createFromHexString(storeId),
        productId,
        variantId: (variantId as string | undefined) ?? null,
      },
      {
        $set: {
          teamId:    mongoose.Types.ObjectId.createFromHexString(session!.teamId),
          storeId:   mongoose.Types.ObjectId.createFromHexString(storeId),
          productId,
          variantId,
          productName,
          variantTitle,
          sku,
          cogs,
          supplierCost,
          shippingToWarehouse,
          importDuties,
          packagingCost,
          prepCost,
          otherLandedCost,
          currency,
          applyToNewOrders: true,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $push: { history: { $each: [{ cogs, effectiveFrom: new Date(), updatedBy, note }], $slice: -50 } } as any,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json(
      {
        id:   rule._id.toString(),
        cogs,
        productId,
        variantId: variantId ?? null,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[v1/cogs POST]", e);
    return NextResponse.json({ error: "Failed to save COGS rule" }, { status: 500 });
  }
}

// ─── PATCH /api/v1/cogs ──────────────────────────────────────────────────────
//
// Bulk-update COGS values by rule ID.
// Body (JSON):
//   rules: Array<{
//     id:    string   (rule _id)
//     cogs:  number   (new total COGS — overrides component breakdown)
//     note?: string
//   }>

export async function PATCH(req: NextRequest) {
  const { session, err } = await auth(req);
  if (err) return err;

  let body: { rules?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rules } = body;

  if (!Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json({ error: "rules must be a non-empty array" }, { status: 400 });
  }
  if (rules.length > 500) {
    return NextResponse.json({ error: "Maximum 500 rules per request" }, { status: 400 });
  }

  // Validate each entry
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i] as Record<string, unknown>;
    if (!r.id || typeof r.id !== "string") {
      return NextResponse.json({ error: `rules[${i}].id is required` }, { status: 400 });
    }
    if (typeof r.cogs !== "number" || r.cogs < 0) {
      return NextResponse.json({ error: `rules[${i}].cogs must be a non-negative number` }, { status: 400 });
    }
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(r.id as string)) {
      return NextResponse.json({ error: `rules[${i}].id is not a valid ID` }, { status: 400 });
    }
  }

  // keyId is the ApiKey document _id — a standard 24-char hex ObjectId
  const updatedBy = new mongoose.Types.ObjectId(session!.keyId);
  const teamOid   = mongoose.Types.ObjectId.createFromHexString(session!.teamId);

  await connectDB();

  try {
    const ops = (rules as { id: string; cogs: number; note?: string }[]).map(({ id, cogs, note }) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(id), teamId: teamOid },
        update: {
          $set: { cogs },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $push: { history: { $each: [{ cogs, effectiveFrom: new Date(), updatedBy, note }], $slice: -50 } } as any,
        },
      },
    }));

    const result = await CogsRuleModel.bulkWrite(ops);

    return NextResponse.json({
      updated:   result.modifiedCount,
      matched:   result.matchedCount,
      unchanged: result.matchedCount - result.modifiedCount,
    });
  } catch (e) {
    console.error("[v1/cogs PATCH]", e);
    return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
  }
}
