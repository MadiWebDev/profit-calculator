/**
 * Risk review queue (Phase 4).
 *
 * GET  /api/risk/review?band=high&status=unreviewed&page=1&limit=50
 *      — team-scoped orders with a risk score, newest riskiest first.
 * POST /api/risk/review { orderId, verdict: "fake" | "genuine" }
 *      — merchant verdict: updates weights, blocklist (fake) and
 *        moneySaved, and marks the order reviewed. Requires write:data.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, parseBody, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { applyReview } from "@/lib/risk-scoring";

const QuerySchema = z
  .object({
    band: z.enum(["low", "medium", "high", "critical"]).optional(),
    status: z.enum(["unreviewed", "genuine", "fake"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const VerdictSchema = z
  .object({
    orderId: z.string().min(1),
    verdict: z.enum(["fake", "genuine"]),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "risk-review");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { band, status, page, limit } = parsed.data;

  await connectDB();
  const filter: Record<string, unknown> = {
    teamId: toObjectId(session.teamId),
    riskScore: { $exists: true },
  };
  if (band) filter.riskBand = band;
  if (status) filter.riskStatus = status;
  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ riskScore: -1, orderDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-accessToken")
      .lean(),
    OrderModel.countDocuments(filter),
  ]);
  return NextResponse.json({
    orders: orders.map((o) => ({ ...o, id: o._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "risk-review-post");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = await parseBody(req, VerdictSchema);
  if ("response" in parsed) return parsed.response;
  const { orderId, verdict } = parsed.data;
  if (!/^[a-f0-9]{24}$/i.test(orderId)) {
    return NextResponse.json({ error: "Invalid orderId", code: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    const outcome = await applyReview(orderId, session.teamId, verdict);
    return NextResponse.json({ ok: true, verdict, ...outcome });
  } catch (e) {
    if (e instanceof Error && e.message === "Order not found") {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "Review failed", code: "REVIEW_FAILED" }, { status: 500 });
  }
}
