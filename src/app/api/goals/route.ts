import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import ProfitGoalModel from "@/models/ProfitGoal";
import { logger, toLogError } from "@/lib/logger";
import { deriveMoneyCurrency } from "@/lib/money-currency-server";

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

    // No silent USD default: derive the goal's currency from the
    // session (user display currency > team > store). The goal's
    // target is typed in the currency the user was working in; when
    // nothing derives, the write is rejected instead of stamped USD.
    const currency = await deriveMoneyCurrency({ userId: session.userId, teamId: session.teamId });
    if (!currency) {
      return fail("Currency is required — set a display currency, a team currency, or connect a store", 400, "CURRENCY_REQUIRED");
    }

    const goal = await ProfitGoalModel.create({
      teamId: toObjectId(session.teamId),
      month,
      targetProfit,
      targetRevenue,
      currency,
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
