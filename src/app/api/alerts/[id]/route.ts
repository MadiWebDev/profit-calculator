/**
 * PATCH /api/alerts/[id] — update a rule's enabled flag, threshold or
 * window (team-scoped, write permission + active subscription).
 * DELETE /api/alerts/[id] — remove a rule.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody, fail } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import AlertRuleModel from "@/models/AlertRule";

const PatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    threshold: z.number().finite().optional(),
    windowDays: z.number().int().min(1).max(365).optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await withRateLimit(req, "standard", "alerts-patch");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const parsed = await parseBody(req, PatchSchema);
  if (parsed instanceof NextResponse) return parsed;

  const { id } = await params;
  await connectDB();
  const rule = await AlertRuleModel.findOneAndUpdate(
    { _id: id, teamId: session.teamId },
    parsed,
    { new: true }
  );
  if (!rule) return fail("Rule not found", 404, "NOT_FOUND");
  return NextResponse.json({ ok: true, enabled: rule.enabled });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await withRateLimit(req, "standard", "alerts-delete");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const block = await checkSubscription(session.teamId);
  if (block) return block;

  const { id } = await params;
  await connectDB();
  const deleted = await AlertRuleModel.findOneAndDelete({ _id: id, teamId: session.teamId });
  if (!deleted) return fail("Rule not found", 404, "NOT_FOUND");
  return NextResponse.json({ ok: true });
}
