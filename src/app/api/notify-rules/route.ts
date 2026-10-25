/**
 * GET /api/notify-rules — the team's rules for all 7 order events
 * (missing events are returned as disabled defaults, never invented
 * as enabled). POST — upsert one rule { event, channel, enabled,
 * whatsappTemplate?, emailSubject? }. Phase 9a.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import NotifyRuleModel from "@/models/NotifyRule";
import type { OrderEvent } from "@/lib/whatsapp";

const EVENTS: OrderEvent[] = [
  "order_confirmed", "order_shipped", "out_for_delivery", "delivered",
  "cancelled", "refund_issued", "cod_tracking",
];

const UpsertSchema = z
  .object({
    event: z.enum([
      "order_confirmed", "order_shipped", "out_for_delivery", "delivered",
      "cancelled", "refund_issued", "cod_tracking",
    ]),
    channel: z.enum(["whatsapp", "email", "both"]),
    enabled: z.boolean(),
    whatsappTemplate: z.string().max(2000).optional(),
    emailSubject: z.string().max(500).optional(),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "notify-rules");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  await connectDB();
  const rows = await NotifyRuleModel.find({ teamId: toObjectId(session.teamId) }).lean();
  const byEvent = new Map(rows.map((r) => [r.event, r]));
  return NextResponse.json({
    rules: EVENTS.map((event) => {
      const r = byEvent.get(event);
      return r
        ? { event, channel: r.channel, enabled: r.enabled, whatsappTemplate: r.whatsappTemplate ?? "", emailSubject: r.emailSubject ?? "" }
        : { event, channel: "both" as const, enabled: false, whatsappTemplate: "", emailSubject: "" };
    }),
  });
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "notify-rules-post");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = await parseBody(req, UpsertSchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;
  await connectDB();
  const saved = await NotifyRuleModel.findOneAndUpdate(
    { teamId: toObjectId(session.teamId), event: d.event },
    {
      teamId: toObjectId(session.teamId),
      event: d.event,
      channel: d.channel,
      enabled: d.enabled,
      whatsappTemplate: d.whatsappTemplate || undefined,
      emailSubject: d.emailSubject || undefined,
    },
    { upsert: true, new: true }
  );
  return NextResponse.json({
    event: saved.event, channel: saved.channel, enabled: saved.enabled,
  });
}
