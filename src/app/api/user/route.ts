/**
 * PATCH /api/user — update the current user's display name, WhatsApp
 * phone number, and/or personal display currency + timezone. Email
 * changes are intentionally not allowed (authentication identity risk).
 * Phone is optional E.164; an empty string clears it.
 *
 * WRITE-ONCE LOCK (onboarding build): displayCurrency and timezone are
 * accepted only while unset. If either is already set, the request is
 * rejected with 400 CURRENCY_LOCKED / TIMEZONE_LOCKED and NOTHING is
 * changed — not even the name/phone in the same request. name and phone
 * stay changeable exactly as today. displayCurrency: null no longer
 * clears a saved preference (that would defeat the lock); it is a
 * no-op when unset and a lock violation when set.
 *
 * onboardingCompleted may only be set to true (completing the
 * onboarding modal); sending false is ignored, never un-completes.
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
import { isValidTimezone } from "@/lib/timezones";
import { decideLockedUpdate } from "@/lib/onboarding-lock";
import { z } from "zod";

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80, "Name too long").optional(),
    phone: z.string().trim().max(20, "Phone too long").optional(),
    // Personal display currency: 3 letters, upper-cased on write.
    // Write-once: accepted only while the user has none saved.
    displayCurrency: z
      .string()
      .trim()
      .length(3, "Currency must be a 3-letter code")
      .regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code")
      .transform((s) => s.toUpperCase())
      .nullable()
      .optional(),
    // Personal display timezone (IANA). Write-once, like the currency.
    timezone: z
      .string()
      .trim()
      .max(80, "Timezone too long")
      .refine((s) => isValidTimezone(s), "Invalid timezone")
      .optional(),
    // Set only by the onboarding modal on save; true completes onboarding.
    onboardingCompleted: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.name !== undefined ||
      v.phone !== undefined ||
      v.displayCurrency !== undefined ||
      v.timezone !== undefined ||
      v.onboardingCompleted !== undefined,
    { message: "Nothing to update" },
  );

export async function PATCH(req: Request) {
  const rl = await withRateLimit(req, "standard", "user-patch");
  if (rl) return rl;

  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const parsed = await parseBody(req, UpdateSchema);
  if ("response" in parsed) return parsed.response;
  const { name, phone, displayCurrency, timezone, onboardingCompleted } = parsed.data;

  // A non-empty phone must be valid E.164; empty clears the number.
  if (phone !== undefined && phone !== "" && !isValidPhoneE164(phone)) {
    return fail("Phone must be in E.164 format, e.g. +923001234567", 400, "INVALID_PHONE");
  }

  try {
    await connectDB();
    // Write-once check FIRST, against the stored values: a locked
    // field rejects the whole request and changes nothing.
    const current = await UserModel.findById(toObjectId(session.userId))
      .select("displayCurrency timezone")
      .lean() as { displayCurrency?: string | null; timezone?: string | null } | null;
    if (!current) return fail("User not found", 404, "USER_NOT_FOUND");
    const decision = decideLockedUpdate(
      { displayCurrency: current.displayCurrency ?? null, timezone: current.timezone ?? null },
      { displayCurrency, timezone },
    );
    if (!decision.ok) {
      return fail(decision.message ?? "This setting is locked", 400, decision.code);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set: Record<string, any> = {};
    if (name !== undefined) set.name = name;
    if (phone !== undefined && phone !== "") set.phone = phone;
    if (typeof displayCurrency === "string") set.displayCurrency = displayCurrency;
    if (typeof timezone === "string") set.timezone = timezone;
    // Only ever completes onboarding — a false never un-completes.
    if (onboardingCompleted === true) set.onboardingCompleted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateDoc: Record<string, any> = {};
    if (Object.keys(set).length > 0) updateDoc.$set = set;
    if (phone === "") updateDoc.$unset = { phone: "" };
    // null displayCurrency is a no-op when unset (nothing to clear);
    // when set, decideLockedUpdate above already rejected the request.
    await UserModel.findByIdAndUpdate(toObjectId(session.userId), updateDoc);

    try {
      await logAudit({
        teamId:       toObjectId(session.teamId),
        userId:       toObjectId(session.userId),
        action:       "settings.updated",
        description:  "Updated profile" + (name !== undefined ? " display name" : "") + (phone !== undefined ? " phone number" : "") + (displayCurrency !== undefined ? " display currency" : "") + (timezone !== undefined ? " timezone" : "") + (onboardingCompleted === true ? " onboarding completed" : ""),
        resourceType: "User",
        resourceId:   session.userId,
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json({
      success: true,
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(displayCurrency !== undefined ? { displayCurrency } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
      ...(onboardingCompleted === true ? { onboardingCompleted: true } : {}),
    });
  } catch (err) {
    logger.error("user update failed", toLogError(err));
    return fail("Update failed", 500, "USER_UPDATE_FAILED");
  }
}
