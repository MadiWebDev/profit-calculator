/**
 * DELETE /api/admin/suppressions/[id] — remove one entry from the
 * suppression list (Phase 3, "unsuppress"). The address/phone can be
 * messaged again afterwards. This removes the block only — it does not
 * rewrite the user's recorded opt-out (User.emailUnsubscribedAt /
 * User.whatsappUnsubscribedAt), which stays as the record of what the
 * user asked for until they opt back in. Consent enforcement itself
 * lands in Phase 5.
 *
 * superAdmin-only. Audit-logged as "suppression.removed".
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import MessageSuppressionModel from "@/models/MessageSuppression";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { logAdminAudit } from "@/lib/audit";
import { unsuppress } from "@/lib/suppression";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "standard", `suppression-remove:${adminId}`);
  if (rl) return rl;

  const { id } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid suppression id" }, { status: 400 });
  }

  await connectDB();
  const entry = await MessageSuppressionModel.findById(id).lean();
  if (!entry) return NextResponse.json({ error: "Suppression not found" }, { status: 404 });

  await unsuppress(entry.identifier, entry.channel);

  await logAdminAudit({
    req,
    session,
    action: "suppression.removed",
    description: `Removed ${entry.identifier} (${entry.channel}, ${entry.reason}) from the suppression list.`,
    resourceType: "MessageSuppression",
    resourceId: entry._id.toString(),
    metadata: { identifier: entry.identifier, channel: entry.channel, reason: entry.reason },
  });

  return NextResponse.json({ success: true, id: entry._id.toString() });
}
