import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { fail, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { WebhookSubscriptionModel } from "@/models/WebhookSubscription";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/webhooks/[id] — remove an outbound webhook subscription.
 * Permission: manage:apikeys. Plan: api.access (Pro).
 */
export async function DELETE(req: Request, ctx: RouteContext) {
  const rl = await withRateLimit(req, "strict", "webhooks-delete");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "manage:apikeys" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const ent = await checkEntitlement(session.teamId, "api.access");
  if ("response" in ent) return ent.response;

  const { id } = await ctx.params;
  let oid;
  try {
    oid = toObjectId(id);
  } catch {
    return fail("Invalid id", 400, "INVALID_ID");
  }

  await connectDB();
  const deleted = await WebhookSubscriptionModel.findOneAndDelete({
    _id: oid,
    teamId: toObjectId(session.teamId),
  });

  if (!deleted) return fail("Webhook not found", 404, "NOT_FOUND");

  await logAudit({
    teamId: session.teamId,
    userId: session.userId,
    action: "webhook.deleted",
    description: `Outbound webhook deleted for ${deleted.url}`,
    metadata: { url: deleted.url },
  });

  return NextResponse.json({ ok: true });
}
