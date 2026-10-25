/**
 * POST /api/risk/backfill — score historical orders that have never
 * been scored (Phase 4: the engine runs on webhooks for new orders
 * and on this endpoint for history). Team-scoped, capped at 200
 * orders per call so a large history cannot block the request;
 * repeat the call until `remaining` is 0.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { scoreAndTagOrder } from "@/lib/risk-scoring";
import { toObjectId } from "@/lib/validation";

const BodySchema = z.object({ limit: z.number().int().min(1).max(200).default(100) }).strict();

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "risk-backfill");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = await parseBody(req, BodySchema).catch(() => ({ data: { limit: 100 } }));
  const limit = "data" in parsed ? parsed.data.limit : 100;

  await connectDB();
  const teamId = toObjectId(session.teamId);
  const unscored = await OrderModel.find({ teamId, riskScore: { $exists: false } })
    .select("_id")
    .sort({ orderDate: -1 })
    .limit(limit)
    .lean();
  let scored = 0;
  let failed = 0;
  for (const o of unscored) {
    try {
      const s = await scoreAndTagOrder(o._id.toString(), session.teamId);
      if (s) scored++;
    } catch {
      failed++;
    }
  }
  const remaining = await OrderModel.countDocuments({ teamId, riskScore: { $exists: false } });
  return NextResponse.json({ scored, failed, remaining });
}
