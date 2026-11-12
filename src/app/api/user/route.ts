/**
 * PATCH /api/user — update the current user's display name, WhatsApp
 * phone number, and/or personal display currency. Email changes are
 * intentionally not allowed (authentication identity risk). Phone is
 * optional E.164; an empty string clears it. displayCurrency is a
 * 3-letter ISO code (upper-cased); null clears the saved preference so
 * the display falls back to the team setting / auto-detection.
 * Kept backward compatible: name alone still works.
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
    // Personal display currency: 3 letters, upper-cased on write.
    // null clears the saved preference (falls back to team / geo / USD).
    displayCurrency: z
      .string()
      .trim()
      .length(3, "Currency must be a 3-letter code")
      .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code")
      .transform((s) => s.toUpperCase())
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.phone !== undefined || v.displayCurrency !== undefined, {
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
  const { name, phone, displayCurrency } = parsed.data;

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
    if (typeof displayCurrency === "string") set.displayCurrency = displayCurrency;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateDoc: Record<string, any> = {};
    if (Object.keys(set).length > 0) updateDoc.$set = set;
    if (phone === "") updateDoc.$unset = { phone: "" };
    // null clears the saved currency preference (unset, not empty string).
    if (displayCurrency === null) {
      updateDoc.$unset = { ...updateDoc.$unset, displayCurrency: "" };
    }
    await UserModel.findByIdAndUpdate(toObjectId(session.userId), updateDoc);

    try {
      await logAudit({
        teamId:       toObjectId(session.teamId),
        userId:       toObjectId(session.userId),
        action:       "settings.updated",
        description:  "Updated profile" + (name !== undefined ? " display name" : "") + (phone !== undefined ? " phone number" : "") + (displayCurrency !== undefined ? " display currency" : ""),
        resourceType: "User",
        resourceId:   session.userId,
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json({ success: true, ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}), ...(displayCurrency !== undefined ? { displayCurrency } : {}) });
  } catch (err) {
    logger.error("user update failed", toLogError(err));
    return fail("Update failed", 500, "USER_UPDATE_FAILED");
  }
}
