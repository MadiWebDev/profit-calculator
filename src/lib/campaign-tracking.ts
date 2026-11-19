/**
 * Campaign delivery tracking — webhook ingestion (Phase 2).
 *
 * Providers deliver status updates at-least-once and out of order, so
 * ingestion is layered:
 *
 * 1. The raw webhook is stored FIRST in ProviderWebhookEvent, keyed by
 *    the provider's delivery id (Resend: the `svix-id` header;
 *    WhatsApp: a sha256 of the raw body, since Meta sends no delivery
 *    id). A redelivery hits the unique index and is acknowledged
 *    without reprocessing.
 * 2. Each status is appended to the MessageEvent log (dedup on the
 *    provider event id). Evidence is never dropped: an event that
 *    cannot move the recipient's status (invalid transition, unknown
 *    message) is still in the log.
 * 3. The recipient's DERIVED status moves only when the transition is
 *    valid per MESSAGE_EVENT_TRANSITIONS — a "read" arriving after a
 *    "bounced" does not resurrect the recipient. The move is an atomic
 *    arrayFilters update guarded on the status read a moment earlier,
 *    retried when a concurrent webhook moved the status first; stats
 *    are then recomputed from the recipients array (same single source
 *    of truth as the send route).
 * 4. Side effects: a bounced or complained email is written to the
 *    suppression list (Phase 1 model; enforcement is Phase 5), and a
 *    complaint also stamps User.emailUnsubscribedAt. A Resend
 *    `email.suppressed` event is NOT written to the suppression list —
 *    the provider already suppresses that address and the event does
 *    not say why; the recipient status still becomes "suppressed".
 *
 * Honesty notes (from the audit): "sent" means the provider API
 * returned 200, nothing more. Email opens are estimated — Apple Mail
 * Privacy Protection pre-loads the tracking pixel, so an "opened"
 * event does not prove a human read it. WhatsApp "read" never fires
 * when the recipient has read receipts off, so absence of "read"
 * proves nothing. Nothing here fabricates a metric: counters come
 * only from real events.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import CampaignModel, {
  type CampaignRecipientStatus,
  type ICampaignRecipient,
} from "@/models/Campaign";
import UserModel from "@/models/User";
import ProviderWebhookEventModel from "@/models/ProviderWebhookEvent";
import type { MessageEventType } from "@/models/MessageEvent";
import {
  ensureMessageEventIndexes,
  isValidMessageEventTransition,
  recordMessageEvent,
  recordWebhookEvent,
} from "@/lib/message-events";
import { summarizeRecipients } from "@/lib/campaigns";
import { suppress } from "@/lib/suppression";

/** Resend webhook event type → our event type. `null` = acknowledge, no status change. */
export const RESEND_EVENT_MAP: Record<string, MessageEventType | null> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": null,
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

/** Meta WhatsApp status → our event type. */
export const WHATSAPP_STATUS_MAP: Record<string, MessageEventType | null> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

/** The recipient timestamp set when the derived status reaches `eventType`. */
export type RecipientTimestampField =
  | "deliveredAt"
  | "openedAt"
  | "clickedAt"
  | "readAt"
  | "failedAt";

export function timestampFieldForEvent(
  eventType: MessageEventType
): RecipientTimestampField | null {
  switch (eventType) {
    case "delivered":
      return "deliveredAt";
    case "opened":
      return "openedAt";
    case "clicked":
      return "clickedAt";
    case "read":
      return "readAt";
    case "failed":
    case "bounced":
      return "failedAt";
    default:
      return null;
  }
}

export interface DerivedRecipientUpdate {
  status: CampaignRecipientStatus;
  timestampField: RecipientTimestampField | null;
  occurredAt: Date;
}

/**
 * Pure: what a webhook event does to a recipient's derived status, or
 * null when the transition is not valid (event is logged, status
 * untouched). Same-status events are not valid transitions — a second
 * "delivered" for an already-delivered recipient changes nothing.
 */
export function deriveRecipientUpdate(
  currentStatus: CampaignRecipientStatus,
  eventType: MessageEventType,
  occurredAt: Date
): DerivedRecipientUpdate | null {
  // A skipped recipient was never sent, so no provider event can ever
  // apply to it — and "skipped" is not a MessageEventType.
  if (currentStatus === "skipped") return null;
  if (!isValidMessageEventTransition(currentStatus, eventType)) return null;
  return {
    status: eventType,
    timestampField: timestampFieldForEvent(eventType),
    occurredAt,
  };
}

export interface ParsedWebhookEvent {
  /** Our event type; null when the provider type maps to nothing. */
  eventType: MessageEventType | null;
  /** Provider-assigned message id (Resend id / Meta wamid). */
  providerMessageId: string;
  /** The address the provider sent to (email or phone). */
  identifier: string;
  occurredAt: Date;
  /** Idempotency key for the MessageEvent log. */
  providerEventId: string;
  /** Raw provider event type, for logging. */
  rawType: string;
}

function asDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Pure: parse a Resend webhook payload. Returns null when the payload
 * is not a recognizable Resend event (caller acknowledges it).
 */
export function parseResendWebhook(
  payload: unknown,
  svixId: string
): ParsedWebhookEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { type, data, created_at } = payload as {
    type?: unknown;
    data?: unknown;
    created_at?: unknown;
  };
  if (typeof type !== "string") return null;
  if (typeof data !== "object" || data === null) return null;
  const { email_id, to } = data as { email_id?: unknown; to?: unknown };
  if (typeof email_id !== "string" || email_id.length === 0) return null;
  const identifier = Array.isArray(to)
    ? to.find((t): t is string => typeof t === "string")
    : typeof to === "string"
      ? to
      : undefined;
  if (!identifier) return null;
  const occurredAt =
    asDate((data as { created_at?: unknown }).created_at) ??
    asDate(created_at) ??
    new Date();
  return {
    eventType: RESEND_EVENT_MAP[type] ?? null,
    providerMessageId: email_id,
    identifier,
    occurredAt,
    providerEventId: `resend:${svixId}`,
    rawType: type,
  };
}

/**
 * Pure: parse a WhatsApp webhook payload. One delivery can carry many
 * statuses (multiple entries/changes); every status becomes an event.
 * Inbound messages (`value.messages`) are not consumed anywhere and
 * are ignored. Returns [] for payloads with no statuses.
 */
export function parseWhatsappWebhook(payload: unknown): ParsedWebhookEvent[] {
  const events: ParsedWebhookEvent[] = [];
  if (typeof payload !== "object" || payload === null) return events;
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return events;
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const value = (change as { value?: unknown }).value;
      if (typeof value !== "object" || value === null) continue;
      const statuses = (value as { statuses?: unknown }).statuses;
      if (!Array.isArray(statuses)) continue;
      for (const status of statuses) {
        if (typeof status !== "object" || status === null) continue;
        const { id, status: statusValue, timestamp, recipient_id } = status as {
          id?: unknown;
          status?: unknown;
          timestamp?: unknown;
          recipient_id?: unknown;
        };
        if (typeof id !== "string" || id.length === 0) continue;
        if (typeof statusValue !== "string") continue;
        if (typeof recipient_id !== "string" || recipient_id.length === 0) continue;
        const tsSeconds =
          typeof timestamp === "string"
            ? Number(timestamp)
            : typeof timestamp === "number"
              ? timestamp
              : NaN;
        const occurredAt =
          Number.isFinite(tsSeconds) && tsSeconds > 0
            ? new Date(tsSeconds * 1000)
            : new Date();
        events.push({
          eventType: WHATSAPP_STATUS_MAP[statusValue] ?? null,
          providerMessageId: id,
          identifier: recipient_id,
          occurredAt,
          providerEventId: `whatsapp:${id}:${statusValue}:${timestamp ?? ""}`,
          rawType: statusValue,
        });
      }
    }
  }
  return events;
}

export type ApplyOutcome =
  | "applied"
  | "no_transition"
  | "unknown_message"
  | "conflict";

/**
 * Apply one parsed event to its recipient: transition-gated status
 * move + timestamp + stats recompute. Retries when a concurrent
 * webhook moved the status between the read and the conditional
 * update. The caller must already have recorded the MessageEvent —
 * this only moves the derived status.
 */
export async function applyRecipientEvent(input: {
  channel: "email" | "whatsapp";
  providerMessageId: string;
  eventType: MessageEventType;
  occurredAt: Date;
}): Promise<ApplyOutcome> {
  await connectDB();
  for (let attempt = 0; attempt < 3; attempt++) {
    const campaign = await CampaignModel.findOne(
      {
        "recipients.providerMessageId": input.providerMessageId,
        channel: input.channel,
      },
      { recipients: 1 }
    ).lean();
    if (!campaign) return "unknown_message";
    const recipient = (campaign.recipients ?? []).find(
      (r: ICampaignRecipient) => r.providerMessageId === input.providerMessageId
    );
    if (!recipient) return "unknown_message";

    const update = deriveRecipientUpdate(
      recipient.status,
      input.eventType,
      input.occurredAt
    );
    if (!update) return "no_transition";

    const set: Record<string, unknown> = {
      "recipients.$[r].status": update.status,
    };
    if (update.timestampField) {
      set[`recipients.$[r].${update.timestampField}`] = update.occurredAt;
    }
    const res = await CampaignModel.updateOne(
      { _id: campaign._id },
      { $set: set },
      {
        arrayFilters: [
          {
            "r.providerMessageId": input.providerMessageId,
            "r.status": recipient.status,
          },
        ],
      }
    );
    if (res.modifiedCount === 1) {
      // Recompute stats from a fresh read — the recipients array is
      // the single source of truth, so the last recompute to run
      // always converges on the full array.
      const fresh = await CampaignModel.findById(campaign._id, {
        recipients: 1,
        stats: 1,
      }).lean();
      if (fresh) {
        const counts = summarizeRecipients(fresh.recipients ?? []);
        await CampaignModel.updateOne(
          { _id: campaign._id },
          {
            $set: {
              stats: { ...counts, overflow: fresh.stats?.overflow ?? 0 },
            },
          }
        );
      }
      return "applied";
    }
    // modifiedCount 0: a concurrent webhook moved the status first.
    // Re-read and re-evaluate the transition from the new status.
  }
  return "conflict";
}

export interface ProcessWebhookResult {
  /** "duplicate" when this delivery id was already stored. */
  outcome: "processed" | "duplicate" | "invalid_payload";
  applied: number;
  noTransition: number;
  unknownMessage: number;
  ignored: number;
  conflicts: number;
}

function emptyResult(outcome: ProcessWebhookResult["outcome"]): ProcessWebhookResult {
  return {
    outcome,
    applied: 0,
    noTransition: 0,
    unknownMessage: 0,
    ignored: 0,
    conflicts: 0,
  };
}

/** Side effects for email events with a known reason: suppression + opt-out stamp. */
async function applyEmailSideEffects(input: {
  eventType: MessageEventType;
  identifier: string;
  campaignId?: string;
}): Promise<void> {
  if (input.eventType === "bounced") {
    await suppress({
      identifier: input.identifier,
      channel: "email",
      reason: "bounced",
      source: "webhook",
      campaignId: input.campaignId,
    });
  } else if (input.eventType === "complained") {
    await suppress({
      identifier: input.identifier,
      channel: "email",
      reason: "complained",
      source: "webhook",
      campaignId: input.campaignId,
    });
    // A complaint is an opt-out signal, not just a delivery failure.
    await UserModel.updateOne(
      { email: input.identifier.toLowerCase().trim() },
      { $set: { emailUnsubscribedAt: new Date() } }
    );
  }
}

/**
 * Full Resend ingest: raw-store dedup → parse → per-event log +
 * status move + side effects. The raw store is keyed by the Svix
 * delivery id, so a redelivery is acknowledged without reprocessing.
 */
export async function processResendWebhook(input: {
  payload: unknown;
  svixId: string;
}): Promise<ProcessWebhookResult> {
  await connectDB();
  // The dedup below depends on the unique indexes existing — make
  // sure they do before the first insert (see ensureMessageEventIndexes).
  await ensureMessageEventIndexes();
  const stored = await recordWebhookEvent({
    provider: "resend",
    providerEventId: `resend:${input.svixId}`,
    payload: (typeof input.payload === "object" && input.payload !== null
      ? (input.payload as Record<string, unknown>)
      : {}) as Record<string, unknown>,
  });
  if (!stored.isNew) return { ...emptyResult("duplicate"), outcome: "duplicate" };

  const parsed = parseResendWebhook(input.payload, input.svixId);
  if (!parsed) {
    await markWebhookProcessed("resend", `resend:${input.svixId}`);
    return emptyResult("invalid_payload");
  }

  const result = emptyResult("processed");
  await ingestResendEvent(parsed, result);
  await markWebhookProcessed("resend", `resend:${input.svixId}`);
  return result;
}

async function ingestResendEvent(
  event: ParsedWebhookEvent,
  result: ProcessWebhookResult
): Promise<void> {
  if (!event.eventType) {
    result.ignored++;
    return;
  }
  // Resolve the campaign first: the MessageEvent log row carries the
  // campaign id, and the suppression record links back to it.
  const campaign = await CampaignModel.findOne(
    {
      "recipients.providerMessageId": event.providerMessageId,
      channel: "email",
    },
    { _id: 1 }
  ).lean();
  if (!campaign) {
    result.unknownMessage++;
    return;
  }
  const campaignId = (campaign._id as mongoose.Types.ObjectId).toString();
  const recorded = await recordMessageEvent({
    campaignId,
    identifier: event.identifier,
    channel: "email",
    provider: "resend",
    providerMessageId: event.providerMessageId,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    eventData: { rawType: event.rawType },
  });
  if (!recorded.created) {
    // Same logical event already ingested (same provider event id).
    return;
  }
  const applied = await applyRecipientEvent({
    channel: "email",
    providerMessageId: event.providerMessageId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
  });
  if (applied === "applied") result.applied++;
  else if (applied === "no_transition") result.noTransition++;
  else if (applied === "unknown_message") result.unknownMessage++;
  else result.conflicts++;
  await applyEmailSideEffects({
    eventType: event.eventType,
    identifier: event.identifier,
    campaignId,
  });
}

/**
 * Full WhatsApp ingest: raw-store dedup (keyed by a sha256 of the raw
 * body, since Meta sends no delivery id) → parse → per-status log +
 * status move. One delivery can carry many statuses.
 */
export async function processWhatsappWebhook(input: {
  payload: unknown;
  deliveryId: string;
}): Promise<ProcessWebhookResult> {
  await connectDB();
  // The dedup below depends on the unique indexes existing — make
  // sure they do before the first insert (see ensureMessageEventIndexes).
  await ensureMessageEventIndexes();
  const stored = await recordWebhookEvent({
    provider: "whatsapp",
    providerEventId: input.deliveryId,
    payload: (typeof input.payload === "object" && input.payload !== null
      ? (input.payload as Record<string, unknown>)
      : {}) as Record<string, unknown>,
  });
  if (!stored.isNew) return { ...emptyResult("duplicate"), outcome: "duplicate" };

  const events = parseWhatsappWebhook(input.payload);
  const result = emptyResult("processed");
  for (const event of events) {
    await ingestWhatsappEvent(event, result);
  }
  await markWebhookProcessed("whatsapp", input.deliveryId);
  return result;
}

async function ingestWhatsappEvent(
  event: ParsedWebhookEvent,
  result: ProcessWebhookResult
): Promise<void> {
  if (!event.eventType) {
    result.ignored++;
    return;
  }
  const campaign = await CampaignModel.findOne(
    {
      "recipients.providerMessageId": event.providerMessageId,
      channel: "whatsapp",
    },
    { _id: 1 }
  ).lean();
  if (!campaign) {
    result.unknownMessage++;
    return;
  }
  const campaignId = (campaign._id as mongoose.Types.ObjectId).toString();
  const recorded = await recordMessageEvent({
    campaignId,
    identifier: event.identifier,
    channel: "whatsapp",
    provider: "whatsapp",
    providerMessageId: event.providerMessageId,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    eventData: { rawType: event.rawType },
  });
  if (!recorded.created) {
    // Same logical event already ingested.
    return;
  }
  const applied = await applyRecipientEvent({
    channel: "whatsapp",
    providerMessageId: event.providerMessageId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
  });
  if (applied === "applied") result.applied++;
  else if (applied === "no_transition") result.noTransition++;
  else if (applied === "unknown_message") result.unknownMessage++;
  else result.conflicts++;
}

async function markWebhookProcessed(
  provider: "resend" | "whatsapp",
  providerEventId: string
): Promise<void> {
  await ProviderWebhookEventModel.updateOne(
    { provider, providerEventId },
    { $set: { processed: true, processedAt: new Date() } }
  );
}
