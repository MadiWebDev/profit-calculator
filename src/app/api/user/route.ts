/**
 * PATCH /api/user — update the current user's display name.
 * Email changes are intentionally not allowed (authentication identity risk).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import { z } from "zod";

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80, "Name too long"),
  })
  .strict();

export async function PATCH(req: Request) {
  const rl = await withRateLimit(req, "standard", "user-patch");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const parsed = await parseBody(req, UpdateSchema);
  if ("response" in parsed) return parsed.response;
  const { name } = parsed.data;

  try {
    await connectDB();
    await UserModel.findByIdAndUpdate(toObjectId(session.userId), { name });

    try {
      await logAudit({
        teamId:       toObjectId(session.teamId),
        userId:       toObjectId(session.userId),
        action:       "settings.updated",
        description:  "Updated profile display name",
        resourceType: "User",
        resourceId:   session.userId,
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json({ success: true, name });
  } catch (err) {
    logger.error("user update failed", toLogError(err));
    return fail("Update failed", 500, "USER_UPDATE_FAILED");
  }
}
