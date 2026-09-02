/**
 * Public API v1 — Orders endpoint
 * Auth: Bearer pc_live_xxx  (API key)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateApiKey, hasScope } from "@/lib/api-key-auth";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  const session = await validateApiKey(req);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid API key in Authorization: Bearer <key>" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  if (!hasScope(session, "read:orders")) {
    return NextResponse.json({ error: "Missing scope: read:orders" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const page    = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit   = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const from    = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to      = searchParams.get("to")   ? new Date(searchParams.get("to")!)   : undefined;

  const query: Record<string, unknown> = { teamId: mongoose.Types.ObjectId.createFromHexString(session.teamId) };
  if (from || to) {
    query.orderDate = {};
    if (from) (query.orderDate as Record<string, Date>)["$gte"] = from;
    if (to)   (query.orderDate as Record<string, Date>)["$lte"] = to;
  }

  await connectDB();
  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .select("externalId orderNumber orderDate status grossRevenue netRevenue totalCogs netProfit profitMargin currency")
      .sort({ orderDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    OrderModel.countDocuments(query),
  ]);

  return NextResponse.json({
    data: orders,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  }, {
    headers: {
      "X-RateLimit-Limit": "100",
      "Content-Type": "application/json",
    },
  });
}
