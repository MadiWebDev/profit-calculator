/**
 * Message-event helpers — the delivery-tracking foundation (Phase 1).
 *
 * Two pieces:
 * 1. A pure status-transition table: which event may legally follow
 *    which. Providers emit events out of order (a "read" can arrive
 *    before its "delivered"), so the transition check is what Phase 2
 *    uses when deriving a recipient's CURRENT status from the
 *    append-only event log — never to drop provider evidence.
 * 2. Idempotent ingest: recordMessageEvent() / recordWebhookEvent()
 *    store the raw event once. A re-delivered webhook hits the unique
 *    index on the provider event id and is reported as "already seen"
 *    instead of being processed twice.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import MessageEventModel, {
  type MessageEventProvider,
  type MessageEventType,
} from "@/models/MessageEvent";
import ProviderWebhookEventModel, {
  type WebhookProvider,
} from "@/models/ProviderWebhookEvent";

export const MESSAGE_EVENT_TYPES: MessageEventType[] = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
  "read",
  "suppressed",
];

/**
 * Valid next events for each current event. Terminal states
 * (bounced, complained, failed, read, suppressed) accept nothing —
 * a provider event arriving after a terminal state is recorded in the
 * log (evidence is never dropped) but must not move the recipient's
 * derived status backwards.
 *
 * Notes on the edges providers actually emit:
 * - sent → bounced: a hard bounce is reported without a delivery.
 * - delivered → read: WhatsApp read receipts (never emitted when the
 *   recipient has read receipts off — absence of "read" proves nothing).
 * - opened/clicked: email only, and opens are estimated (Apple Mail
 *   Privacy Protection pre-loads images) — the caveat lives with the
 *   UI, not the event.
 * - any state → suppressed: a provider suppression (e.g. Resend
 *   email.suppressed) can arrive after a send.
 */
export const MESSAGE_EVENT_TRANSITIONS: Record<MessageEventType, MessageEventType[]> = {
  sent: ["delivered", "opened", "clicked", "bounced", "failed", "read", "suppressed"],
  delivered: ["opened", "clicked", "read", "bounced", "complained", "failed", "suppressed"],
  opened: ["clicked", "complained", "suppressed"],
  clicked: ["complained", "suppressed"],
  bounced: [],
  complained: [],
  failed: [],
  read: [],
  suppressed: [],
};

/** Pure: may `to` legally follow `from` as the recipient's next status? */
export function isValidMessageEventTransition(
  from: MessageEventType,
  to: MessageEventType
): boolean {
  if (from === to) return false;
  return (MESSAGE_EVENT_TRANSITIONS[from] ?? []).includes(to);
}

export interface RecordMessageEventInput {
  campaignId: string;
  userId?: string;
  identifier: string;
  channel: "email" | "whatsapp";
  provider: MessageEventProvider;
  providerMessageId?: string;
  /** Provider's own event id — the idempotency key. Omit only when the provider supplies none. */
  providerEventId?: string;
  eventType: MessageEventType;
  occurredAt?: Date;
  eventData?: Record<string, unknown>;
}

export interface RecordMessageEventResult {
  /** True when a new event row was written. */
  created: boolean;
  /** "duplicate" when providerEventId was already recorded. */
  reason?: "duplicate";
}

/**
 * Store one delivery event, idempotently. When providerEventId is
 * given and already exists, the insert fails on the unique index and
 * this returns { created: false, reason: "duplicate" } — the caller
 * must NOT process the event a second time. Events without a provider
 * event id are always stored (the provider gave us nothing to dedup
 * on); callers should always pass one when the provider supplies it.
 */
export async function recordMessageEvent(
  input: RecordMessageEventInput
): Promise<RecordMessageEventResult> {
  await connectDB();
  try {
    await MessageEventModel.create({
      campaignId: new mongoose.Types.ObjectId(input.campaignId),
      userId: input.userId ? new mongoose.Types.ObjectId(input.userId) : undefined,
      identifier: input.identifier,
      channel: input.channel,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      occurredAt: input.occurredAt ?? new Date(),
      eventData: input.eventData,
    });
    return { created: true };
  } catch (err) {
    // 11000 = duplicate key on providerEventId: the webhook was already processed.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: unknown }).code === 11000
    ) {
      return { created: false, reason: "duplicate" };
    }
    throw err;
  }
}

export interface RecordWebhookEventInput {
  provider: WebhookProvider;
  /** Dedup key computed by the ingester from the provider's identifiers. */
  providerEventId: string;
  payload: Record<string, unknown>;
}

export interface RecordWebhookEventResult {
  /** True when this is the first time the event was seen. */
  isNew: boolean;
}

/**
 * Store the raw inbound webhook BEFORE processing it, so a crash
 * mid-processing never loses the event and a duplicate delivery is
 * provably a duplicate. Returns isNew=false when the same
 * providerEventId was already stored — the caller must skip
 * processing and answer 200.
 */
export async function recordWebhookEvent(
  input: RecordWebhookEventInput
): Promise<RecordWebhookEventResult> {
  await connectDB();
  try {
    await ProviderWebhookEventModel.create({
      provider: input.provider,
      providerEventId: input.providerEventId,
      payload: input.payload,
      receivedAt: new Date(),
      processed: false,
    });
    return { isNew: true };
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: unknown }).code === 11000
    ) {
      return { isNew: false };
    }
    throw err;
  }
}
