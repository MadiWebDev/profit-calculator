/**
 * PATCH /api/user — update the current user's display name and/or
 * WhatsApp phone number. Email changes are intentionally not allowed
 * (authentication identity risk). Phone is optional E.164; an empty
 * string clears it. Kept backward compatible: name alone still works.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import { isValidPhoneE164 } from "@/lib/whatsapp";
import { z } from "zod";

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80, "Name too long").optional(),
    phone: z.string().trim().max(20, "Phone too long").optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.phone !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(req: Request) {
  const rl = await withRateLimit(req, "standard", "user-patch");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const parsed = await parseBody(req, UpdateSchema);
  if ("response" in parsed) return parsed.response;
  const { name, phone } = parsed.data;

  // A non-empty phone must be valid E.164; empty clears the number.
  if (phone !== undefined && phone !== "" && !isValidPhoneE164(phone)) {
    return fail("Phone must be in E.164 format, e.g. +923001234567", 400, "INVALID_PHONE");
  }

  try {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set: Record<string, any> = {};
    if (name !== undefined) set.name = name;
    if (phone !== undefined && phone !== "") set.phone = phone;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateDoc: Record<string, any> = {};
    if (Object.keys(set).length > 0) updateDoc.$set = set;
    if (phone === "") updateDoc.$unset = { phone: "" };
    await UserModel.findByIdAndUpdate(toObjectId(session.userId), updateDoc);

    try {
      await logAudit({
        teamId:       toObjectId(session.teamId),
        userId:       toObjectId(session.userId),
        action:       "settings.updated",
        description:  "Updated profile" + (name !== undefined ? " display name" : "") + (phone !== undefined ? " phone number" : ""),
        resourceType: "User",
        resourceId:   session.userId,
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json({ success: true, ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}) });
  } catch (err) {
    logger.error("user update failed", toLogError(err));
    return fail("Update failed", 500, "USER_UPDATE_FAILED");
  }
}
