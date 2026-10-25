/**
 * GET /api/alerts — list a team's guardrail rules plus their current
 * evaluations (pure evaluator over the live window).
 * POST /api/alerts — create a rule (write permission + active
 * subscription required).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import AlertRuleModel from "@/models/AlertRule";
import { evaluateTeamAlerts } from "@/lib/alerts-server";

const CreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    metric: z.enum(["profit_margin", "refund_rate", "rto_rate", "avg_order_profit"]),
    operator: z.enum(["below", "above"]),
    threshold: z.number().finite(),
    windowDays: z.number().int().min(1).max(365),
    enabled: z.boolean().optional().default(true),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "alerts-list");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const data = await evaluateTeamAlerts(session.teamId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "alerts-create");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = await parseBody(req, CreateSchema);
  if (parsed instanceof NextResponse) return parsed;

  await connectDB();
  const rule = await AlertRuleModel.create({ teamId: session.teamId, ...parsed });
  return NextResponse.json(
    {
      id: rule._id.toString(),
      name: rule.name,
      metric: rule.metric,
      operator: rule.operator,
      threshold: rule.threshold,
      windowDays: rule.windowDays,
      enabled: rule.enabled,
    },
    { status: 201 }
  );
}
