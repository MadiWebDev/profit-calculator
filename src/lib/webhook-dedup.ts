/**
 * Webhook delivery deduplication — shared claim logic for at-least-once
 * webhook sources (Paddle today; other providers can reuse it).
 *
 * claimWebhookEvent() is atomic: exactly one concurrent delivery wins and
 * gets "process"; every other delivery gets "duplicate".
 *
 * - First delivery inserts the WebhookEvent row (status "received") and wins.
 * - A simultaneous second delivery finds the row with status "received" and
 *   loses (the row is being processed right now).
 * - A redelivery of a "processed" event is a true duplicate → skip.
 * - A redelivery of a "failed" event takes over atomically (only one
 *   concurrent retry wins) so Paddle retries reprocess exactly once.
 * - A redelivery that finds a stale "received" row (worker crashed between
 *   claim and finish, older than STALE_RECEIVED_MS) takes it over, so a
 *   retried event can never get stuck behind a dead claim.
 */
import { WebhookEventModel } from "@/models/WebhookEvent";
import { logger } from "@/lib/logger";

/** A "received" row older than this is considered a crashed claim. */
export const STALE_RECEIVED_MS = 10 * 60 * 1000;

export type WebhookClaim = "process" | "duplicate";

export async function claimWebhookEvent(opts: {
  eventId: string;
  source: string;
  eventType: string;
  occurredAt?: Date;
}): Promise<WebhookClaim> {
  const { eventId, source, eventType, occurredAt } = opts;

  let claimResult;
  try {
    claimResult = await WebhookEventModel.findOneAndUpdate(
      { eventId },
      {
        $setOnInsert: {
          eventId,
          source,
          eventType,
          occurredAt,
          status: "received",
        },
      },
      { upsert: true, new: true, includeResultMetadata: true }
    );
  } catch (err) {
    // Lost the insert race: a concurrent delivery created the row first.
    // It is being (or will be) processed — acknowledge as duplicate.
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      logger.info("webhook: lost insert race, duplicate delivery skipped", {
        eventId,
        eventType,
        source,
      });
      return "duplicate";
    }
    throw err;
  }
  const claimedDoc = claimResult.value ? claimResult.value.toObject() : null;
  const weInserted = claimResult.lastErrorObject?.updatedExisting === false;

  if (weInserted || !claimedDoc) return "process";

  if (claimedDoc.status === "failed") {
    const tookOver = await WebhookEventModel.findOneAndUpdate(
      { eventId, status: "failed" },
      { $set: { status: "received" }, $unset: { error: 1 } },
      { new: true }
    ).lean();
    if (!tookOver) {
      logger.info("webhook: concurrent retry skipped", { eventId, eventType, source });
      return "duplicate";
    }
    return "process";
  }

  if (claimedDoc.status === "received") {
    const staleCutoff = new Date(Date.now() - STALE_RECEIVED_MS);
    const createdAt = claimedDoc.createdAt ? new Date(claimedDoc.createdAt) : null;
    const tookOver =
      createdAt && createdAt < staleCutoff
        ? await WebhookEventModel.findOneAndUpdate(
            { eventId, status: "received", createdAt: { $lt: staleCutoff } },
            { $set: { status: "received" } },
            { new: true }
          ).lean()
        : null;
    if (!tookOver) {
      logger.info("webhook: duplicate delivery skipped", {
        eventId,
        eventType,
        source,
        status: "received",
      });
      return "duplicate";
    }
    logger.info("webhook: took over stale received event", { eventId, eventType, source });
    return "process";
  }

  // "processed" (or "skipped") → true duplicate, never reprocess.
  logger.info("webhook: duplicate delivery skipped", {
    eventId,
    eventType,
    source,
    status: claimedDoc.status,
  });
  return "duplicate";
}

/** Mark a claimed event finished (processed / failed with message). */
export async function finishWebhookEvent(
  eventId: string,
  outcome: { status: "processed" } | { status: "failed"; error: string }
): Promise<void> {
  if (outcome.status === "processed") {
    await WebhookEventModel.updateOne({ eventId }, { $set: { status: "processed" } });
  } else {
    await WebhookEventModel.updateOne(
      { eventId },
      { $set: { status: "failed", error: outcome.error.slice(0, 2000) } }
    );
  }
}
