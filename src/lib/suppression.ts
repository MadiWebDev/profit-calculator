/**
 * Suppression helpers — the consent foundation (Phase 1).
 *
 * A suppression is one address that must never receive campaign
 * messages on a channel again. Phase 1 provides the model + the
 * helpers to write and check it. Send-time enforcement lands in
 * Phase 5, so no recipient is silently excluded before the
 * enforcement + UI exist to explain it.
 *
 * Normalization: email identifiers are lowercased + trimmed, phones
 * are trimmed — "A@x.com" and "a@x.com" are the same suppression.
 * A channel of "all" suppresses both email and WhatsApp for the
 * identifier; isSuppressed() checks the exact channel and "all".
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import MessageSuppressionModel, {
  type SuppressionChannel,
  type SuppressionReason,
  type SuppressionSource,
} from "@/models/MessageSuppression";

export const SUPPRESSION_REASONS: SuppressionReason[] = [
  "unsubscribed",
  "bounced",
  "complained",
  "manual",
  "invalid",
];

export const SUPPRESSION_SOURCES: SuppressionSource[] = [
  "unsubscribe_link",
  "reply",
  "webhook",
  "admin",
  "bounce",
];

/** Pure: normalize an identifier for suppression storage/lookup. */
export function normalizeSuppressionIdentifier(
  identifier: string,
  channel: SuppressionChannel
): string {
  const trimmed = (identifier ?? "").trim();
  // Email addresses are case-insensitive; phones are kept as given
  // (E.164 is already canonical when it reaches us).
  return channel === "email" ? trimmed.toLowerCase() : trimmed;
}

/** Pure: is this a usable suppression reason? */
export function isValidSuppressionReason(reason: string): reason is SuppressionReason {
  return (SUPPRESSION_REASONS as string[]).includes(reason);
}

export interface SuppressInput {
  identifier: string;
  channel: SuppressionChannel;
  reason: SuppressionReason;
  source: SuppressionSource;
  campaignId?: string;
  createdBy?: string;
  note?: string;
}

/**
 * Record a suppression, idempotently: a second suppress for the same
 * (identifier, channel) updates the existing row (latest reason/source
 * wins) instead of creating a duplicate.
 */
export async function suppress(input: SuppressInput) {
  await connectDB();
  const identifier = normalizeSuppressionIdentifier(input.identifier, input.channel);
  return MessageSuppressionModel.findOneAndUpdate(
    { identifier, channel: input.channel },
    {
      $set: {
        identifier,
        channel: input.channel,
        reason: input.reason,
        source: input.source,
        campaignId: input.campaignId
          ? new mongoose.Types.ObjectId(input.campaignId)
          : undefined,
        createdBy: input.createdBy
          ? new mongoose.Types.ObjectId(input.createdBy)
          : undefined,
        note: input.note,
      },
    },
    { new: true, upsert: true }
  );
}

/**
 * Is this identifier suppressed on this channel? Checks the exact
 * channel and "all". A suppressed identifier must never be sent to —
 * there is no override at send time.
 */
export async function isSuppressed(
  identifier: string,
  channel: "email" | "whatsapp"
): Promise<boolean> {
  await connectDB();
  const normalized = normalizeSuppressionIdentifier(identifier, channel);
  const found = await MessageSuppressionModel.findOne({
    identifier: normalized,
    channel: { $in: [channel, "all"] },
  })
    .select("_id")
    .lean();
  return found !== null;
}

/**
 * Remove a suppression — a deliberate, audited admin act (Phase 5 UI),
 * never a send-time bypass. Returns true when a row was removed.
 */
export async function unsuppress(
  identifier: string,
  channel: SuppressionChannel
): Promise<boolean> {
  await connectDB();
  const normalized = normalizeSuppressionIdentifier(identifier, channel);
  const res = await MessageSuppressionModel.deleteOne({
    identifier: normalized,
    channel,
  });
  return res.deletedCount > 0;
}
