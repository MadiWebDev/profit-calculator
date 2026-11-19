/**
 * Campaign senders — one email sender (Resend) and one WhatsApp template
 * sender (Meta WhatsApp Cloud API), both following the patterns already
 * in the repo (src/lib/email.ts, src/lib/notify-server.ts).
 *
 * - The Resend client is lazy: importing this module never throws when
 *   RESEND_API_KEY is missing (build time). A missing key throws only
 *   when a send is actually attempted, and the route preflights it so a
 *   campaign is never left half-sent because of missing credentials.
 * - The WhatsApp sender posts a TEMPLATE message (not a free-text one):
 *   marketing messages outside the 24-hour customer-service window must
 *   use a Meta-approved template. The template NAME comes from the
 *   admin's campaign form — nothing is hardcoded. When Meta rejects the
 *   template, the exact error text from Meta's response is returned so
 *   the admin sees why (e.g. template not approved / name wrong).
 * - `fetch` and the Resend call are injectable so tests can assert the
 *   exact payload without sending a real message.
 * - Every provider call carries a 30s abort signal
 *   (`PROVIDER_TIMEOUT_MS`): a stalled socket used to hang the whole
 *   send batch forever — the campaign sat at "sending" with no
 *   progress persisted until an admin cancelled it. Now the recipient
 *   is recorded failed with a timeout error and the batch moves on.
 */
import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { whatsappTemplateBodyParameters } from "@/lib/campaigns";

/**
 * Per-recipient provider timeout (ms). Bounds one stalled provider
 * call — Resend or Meta Graph — so a hung socket cannot stall a send
 * batch indefinitely. Smoke proof 2026-11-19: Resend calls through
 * the VM proxy hung 40–100s+ each, and a 3-recipient UI send never
 * finished inside the test's 30s wait.
 */
export const PROVIDER_TIMEOUT_MS = 30_000;

/** An abort signal that fires after PROVIDER_TIMEOUT_MS. */
export function providerTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

const FROM = process.env.EMAIL_FROM ?? "GetProfitCalc <onboarding@resend.dev>";

export interface CampaignSendResult {
  ok: boolean;
  /** Provider error text when ok is false (Meta/Resend message verbatim). */
  error?: string;
  /** True when the send was skipped because credentials are not configured. */
  skipped?: boolean;
  /** Provider-assigned message id (Meta wamid) — stored on the recipient so webhooks can correlate back to it. */
  messageId?: string;
}

type EmailSendImpl = (payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) => Promise<{ id?: string } | undefined>;

/** Lazily constructed — module import must never throw when env is missing. */
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    resend = new Resend(apiKey);
  }
  return resend;
}

async function defaultEmailSendImpl(payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ id?: string } | undefined> {
  const { data, error } = await getResend().emails.send(payload, {
    signal: providerTimeoutSignal(),
  });
  if (error) {
    logger.error("[Resend] campaign send error", new Error(error.message ?? "Failed to send email"));
    throw new Error(error.message ?? "Failed to send email");
  }
  // data.id is the Resend message id — the key webhook events
  // correlate back to this recipient. It used to be discarded here.
  return data ? { id: data.id } : undefined;
}

/**
 * Send one campaign email. Returns the Resend message id (undefined
 * when the sender does not report one). Throws when Resend is not
 * configured or the send fails — callers record it as a per-recipient
 * failure. Tests pass a fake `sendImpl` and assert the payload instead
 * of sending.
 */
export async function sendCampaignEmail(
  to: string,
  subject: string,
  html: string,
  sendImpl: EmailSendImpl = defaultEmailSendImpl
): Promise<string | undefined> {
  const result = await sendImpl({ from: FROM, to, subject, html });
  return result?.id;
}

/**
 * Extract Meta's human-readable error from a Graph API error body:
 * { "error": { "message": "...", ... } }. Falls back to the raw body.
 */
export function extractMetaErrorText(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return body.slice(0, 300) || "WhatsApp send failed";
}

/**
 * Send one WhatsApp marketing template message. Returns
 * { ok: false, skipped: true } when credentials are missing (caller
 * treats it as a preflight failure, not a per-recipient failure) and
 * { ok: false, error } with Meta's exact error text on API errors.
 */
export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  recipientName: string,
  fetchImpl: typeof fetch = fetch
): Promise<CampaignSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, skipped: true, error: "WhatsApp credentials not configured" };
  }
  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        signal: providerTimeoutSignal(),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: "en_US" },
            components: [
              {
                type: "body",
                parameters: whatsappTemplateBodyParameters(recipientName),
              },
            ],
          },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `WhatsApp API HTTP ${res.status}: ${extractMetaErrorText(body)}` };
    }
    // Meta's message id (wamid) — the key webhook status events
    // correlate back to this recipient. It used to be discarded here.
    const messageId = extractMetaMessageId(await res.text().catch(() => ""));
    return messageId ? { ok: true, messageId } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "WhatsApp send failed" };
  }
}

/**
 * Extract Meta's message id from a Graph API send response body:
 * { "messages": [{ "id": "wamid...." }] }. Returns undefined when the
 * body carries no id (never throws — a missing id must not fail a
 * send that Meta already accepted).
 */
export function extractMetaMessageId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { messages?: { id?: string }[] };
    const id = parsed?.messages?.[0]?.id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}
