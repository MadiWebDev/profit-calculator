import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { requireStepUpIf2fa } from "@/lib/step-up";
import { parseBody } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { recordSecurityEvent } from "@/lib/security-events";

const Schema = z.object({ confirm: z.literal("DELETE MY ACCOUNT") }).strict();

/**
 * POST /api/privacy/delete — request account/data deletion (S2.3).
 * Nothing is deleted immediately: a 14-day grace period applies
 * (deletionScheduledAt), during which sign-in cancels the request.
 * The actual purge runs from a cron job (see scripts/purge-deleted-accounts.ts
 * and docs/DATA_MAP.md) — irreversible deletions are never done inline
 * in a request handler, by design.
 */
export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const stepUp = await requireStepUpIf2fa(req, session.userId, "data-deletion");
  if (stepUp) return stepUp;
  const parsed = await parseBody(req, Schema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const scheduledAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await UserModel.findByIdAndUpdate(session.userId, { deletionRequestedAt: new Date(), deletionScheduledAt: scheduledAt });
  await recordSecurityEvent({ teamId: session.teamId, userId: session.userId, type: "data_deletion_requested", metadata: { scheduledAt: scheduledAt.toISOString() } });
  return NextResponse.json({ deletionRequested: true, scheduledAt: scheduledAt.toISOString(), graceDays: 14 });
}
