import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * ProviderWebhookEvent — the raw inbound webhook, stored BEFORE any
 * processing, so a webhook is never lost to a crash and a duplicate
 * delivery is provably a duplicate.
 *
 * providerEventId is the dedup key the ingester computes from the
 * provider's own identifiers (Resend: the Svix message id; WhatsApp:
 * wamid + status + timestamp, since Meta sends no global event id).
 * The unique index makes the second delivery of the same event fail
 * the insert — recordWebhookEvent() treats that as "already seen"
 * instead of processing the event twice.
 *
 * `processed` flips to true only after the event's MessageEvent rows
 * are written. An event stuck at processed=false is a visible,
 * retryable failure — not a silent drop.
 */
export type WebhookProvider = "resend" | "whatsapp";

export interface IProviderWebhookEvent extends Document {
  provider: WebhookProvider;
  /** Dedup key computed by the ingester from the provider's identifiers. */
  providerEventId: string;
  /** Raw provider payload, as received. Never logged. */
  payload: Record<string, unknown>;
  receivedAt: Date;
  processed: boolean;
  processedAt?: Date;
  /** Processing failure text, when the event could not be applied. */
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProviderWebhookEventSchema = new Schema<IProviderWebhookEvent>(
  {
    provider: { type: String, enum: ["resend", "whatsapp"], required: true },
    providerEventId: { type: String, required: true, maxlength: 512 },
    payload: { type: Schema.Types.Mixed, required: true },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    processed: { type: Boolean, required: true, default: false },
    processedAt: Date,
    error: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

ProviderWebhookEventSchema.index({ providerEventId: 1 }, { unique: true });
ProviderWebhookEventSchema.index({ provider: 1, processed: 1, receivedAt: -1 });

export default models.ProviderWebhookEvent ||
  model<IProviderWebhookEvent>("ProviderWebhookEvent", ProviderWebhookEventSchema);
