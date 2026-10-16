import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import {
  WebhookSubscriptionModel,
  OUTBOUND_WEBHOOK_EVENTS,
} from "@/models/WebhookSubscription";

const CreateSchema = z
  .object({
    url: z.string().trim().url().max(2000),
    events: z.array(z.enum(OUTBOUND_WEBHOOK_EVENTS)).min(1).max(4),
  })
  .strict();

/**
 * GET /api/webhooks — list outbound webhook subscriptions (secrets never returned).
 * Permission: manage:apikeys. Plan: api.access (Pro).
 */
export async function GET(req: Request) {
  const rl = await withRateLimit(req, "strict", "webhooks-list");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "manage:apikeys" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const ent = await checkEntitlement(session.teamId, "api.access");
  if ("response" in ent) return ent.response;

  await connectDB();
  const subs = await WebhookSubscriptionModel.find({ teamId: toObjectId(session.teamId) })
    .select("-secret")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ webhooks: subs });
}

/**
 * POST /api/webhooks — create a subscription. Returns the signing secret ONCE.
 * Permission: manage:apikeys. Plan: api.access (Pro).
 */
export async function POST(req: Request) {
  const rl = await withRateLimit(req, "strict", "webhooks-create");
  if (rl) return rl;

  const result = await requireAuth(req, { permission: "manage:apikeys" });
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const ent = await checkEntitlement(session.teamId, "api.access");
  if ("response" in ent) return ent.response;

  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const { url, events } = parsed.data;

  await connectDB();

  const count = await WebhookSubscriptionModel.countDocuments({
    teamId: toObjectId(session.teamId),
    active: true,
  });
  if (count >= 10) {
    return fail("Maximum of 10 active webhook subscriptions per team", 400, "LIMIT_REACHED");
  }

  const secret = crypto.randomBytes(32).toString("hex");
  const sub = await WebhookSubscriptionModel.create({
    teamId: toObjectId(session.teamId),
    url,
    secret: encrypt(secret),
    events,
    active: true,
  });

  await logAudit({
    teamId: session.teamId,
    userId: session.userId,
    action: "webhook.created",
    description: `Outbound webhook created for ${url}`,
    metadata: { url, events },
  });

  const rest = sub.toObject();
  delete (rest as { secret?: string }).secret;
  return NextResponse.json({ webhook: rest, secret }, { status: 201 });
}
