import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import ProfitGoalModel from "@/models/ProfitGoal";
import { logger, toLogError } from "@/lib/logger";

const CreateGoalSchema = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
    targetProfit: z.number().min(0).max(1_000_000_000),
    targetRevenue: z.number().min(0).max(1_000_000_000).optional(),
    alertThreshold: z.number().min(1).max(100).default(70),
  })
  .strict();

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "goals-post", permission: "write:data" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, CreateGoalSchema);
  if ("response" in parsed) return parsed.response;
  const { month, targetProfit, targetRevenue, alertThreshold } = parsed.data;

  try {
    await connectDB();

    const existing = await ProfitGoalModel.findOne({
      teamId: toObjectId(session.teamId),
      month,
    })
      .select("_id")
      .lean();
    if (existing) {
      return fail("A goal for this month already exists", 409, "GOAL_EXISTS");
    }

    const goal = await ProfitGoalModel.create({
      teamId: toObjectId(session.teamId),
      month,
      targetProfit,
      targetRevenue,
      currency: "USD",
      alerts: {
        enabled: true,
        email: true,
        profitBelowPercent: alertThreshold,
      },
    });

    return NextResponse.json({ id: goal._id.toString() }, { status: 201 });
  } catch (err) {
    logger.error("goal create failed", toLogError(err), { teamId: session.teamId });
    return fail("Failed to create goal", 500, "GOAL_CREATE_FAILED");
  }
}

export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "goals-get" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  await connectDB();
  const goals = await ProfitGoalModel.find({ teamId: toObjectId(session.teamId) })
    .sort({ month: -1 })
    .lean();
  return NextResponse.json({ goals });
}
