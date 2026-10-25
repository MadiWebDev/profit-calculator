/**
 * Order notification templates + channel routing (WhatsApp / email).
 *
 * PURE MODULE — no sending, no credentials, no network, no database.
 * Callers take the output of buildMessage() / selectChannels() and hand
 * the chosen channel payload to their own sender (WhatsApp provider,
 * email service, in-app queue, ...). This module never invents a contact:
 * a channel is only selected when the caller confirms a contact is
 * available for it (see selectChannels()).
 *
 * Channel model:
 * - A merchant configures one NotifyRule per OrderEvent.
 * - rule.channel is the merchant's preference: 'whatsapp', 'email', or
 *   'both'. 'both' degrades gracefully to whichever channel(s) are
 *   actually available for this order — it never fails the whole
 *   notification because one channel is missing.
 * - available.whatsapp / available.email mean "we have a usable contact
 *   for this channel for this order" (e.g. a valid phone number on file
 *   for WhatsApp, an email address on file for email). A channel whose
 *   contact is missing is skipped, not an error.
 */

export type OrderEvent =
  | "order_confirmed"
  | "order_shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refund_issued"
  | "cod_tracking";

export type Channel = "whatsapp" | "email" | "both";

export interface NotifyRule {
  event: OrderEvent;
  channel: Channel;
  enabled: boolean;
  /** Optional custom template; {{key}} placeholders are substituted via renderTemplate(). */
  whatsappTemplate?: string;
  /** Optional custom subject; {{key}} placeholders are substituted via renderTemplate(). */
  emailSubject?: string;
}

export interface OrderNotifyInput {
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  trackingId?: string;
  courier?: string;
  amount?: number;
  currency?: string;
  storeName: string;
}

export interface BuiltMessage {
  whatsappText: string;
  emailSubject: string;
  emailBody: string;
}

/** Template variables available to custom templates (see renderTemplate). */
export type TemplateVars = Record<string, string | number | undefined>;

/**
 * Basic E.164 validation: a leading "+" followed by 8–15 digits, the
 * first digit after "+" non-zero. Whitespace around the number is ignored.
 * This checks format only — it does not verify the number is real or
 * reachable.
 */
export function isValidPhoneE164(phone: string): boolean {
  if (typeof phone !== "string") return false;
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/**
 * Safe {{key}} substitution. Unknown keys are left exactly as-is
 * (e.g. "{{unknown}}" stays "{{unknown}}") so a typo in a merchant
 * template is visible instead of silently vanishing. No code is ever
 * executed: values are inserted as plain text.
 */
export function renderTemplate(
  template: string,
  vars: TemplateVars
): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

function varsOf(input: OrderNotifyInput): TemplateVars {
  return {
    orderNumber: input.orderNumber,
    customerName: input.customerName,
    storeName: input.storeName,
    trackingId: input.trackingId,
    courier: input.courier,
    amount:
      input.amount === undefined
        ? undefined
        : `${input.currency ?? ""}${input.amount}`.trim(),
    currency: input.currency,
  };
}

function amountLine(input: OrderNotifyInput): string {
  if (input.amount === undefined) return "";
  const formatted = input.currency
    ? `${input.currency} ${input.amount}`
    : `${input.amount}`;
  return ` Total: ${formatted}.`;
}

/**
 * Default message copy per event. Tracking details are included only
 * where they make sense: cancelled and refund messages NEVER include a
 * tracking id (even if one is present on the input), because a tracking
 * id on a cancelled/refunded order would confuse the customer.
 * The COD tracking message always states the order is cash-on-delivery
 * and includes the tracking id and courier whenever they are present.
 */
function defaultMessages(
  event: OrderEvent,
  input: OrderNotifyInput
): { whatsappText: string; emailSubject: string; emailBody: string } {
  const { orderNumber, customerName, storeName } = input;
  const amount = amountLine(input);
  const greeting = `Hi ${customerName},`;
  const signoff = `Thanks for shopping with ${storeName}!`;

  switch (event) {
    case "order_confirmed":
      return {
        whatsappText:
          `${greeting} Your order ${orderNumber} from ${storeName} is confirmed.${amount} We'll let you know as soon as it ships. ${signoff}`,
        emailSubject: `Your order ${orderNumber} is confirmed — ${storeName}`,
        emailBody:
          `${greeting}\n\nGood news — your order ${orderNumber} from ${storeName} is confirmed.${amount}\n\nWe'll email you again as soon as your order ships.\n\n${signoff}`,
      };
    case "order_shipped": {
      const tracking = input.trackingId
        ? ` Tracking ID: ${input.trackingId}${input.courier ? ` via ${input.courier}` : ""}.`
        : "";
      return {
        whatsappText:
          `${greeting} Your order ${orderNumber} from ${storeName} has shipped.${tracking} ${signoff}`,
        emailSubject: `Your order ${orderNumber} has shipped — ${storeName}`,
        emailBody:
          `${greeting}\n\nYour order ${orderNumber} from ${storeName} has shipped.${tracking}\n\n${signoff}`,
      };
    }
    case "out_for_delivery":
      return {
        whatsappText:
          `${greeting} Your order ${orderNumber} from ${storeName} is out for delivery and should arrive soon. Please keep your phone nearby for the courier. ${signoff}`,
        emailSubject: `Your order ${orderNumber} is out for delivery — ${storeName}`,
        emailBody:
          `${greeting}\n\nYour order ${orderNumber} from ${storeName} is out for delivery and should arrive soon. Please keep your phone nearby for the courier.\n\n${signoff}`,
      };
    case "delivered":
      return {
        whatsappText:
          `${greeting} Your order ${orderNumber} from ${storeName} has been delivered. We hope you love it! ${signoff}`,
        emailSubject: `Your order ${orderNumber} has been delivered — ${storeName}`,
        emailBody:
          `${greeting}\n\nYour order ${orderNumber} from ${storeName} has been delivered. We hope you love it!\n\n${signoff}`,
      };
    case "cancelled":
      // Deliberately no tracking id here, even if input.trackingId is set.
      return {
        whatsappText:
          `${greeting} Your order ${orderNumber} from ${storeName} has been cancelled.${amount} If you already paid, your refund will be processed shortly. ${signoff}`,
        emailSubject: `Your order ${orderNumber} has been cancelled — ${storeName}`,
        emailBody:
          `${greeting}\n\nYour order ${orderNumber} from ${storeName} has been cancelled.${amount} If you already paid, your refund will be processed shortly.\n\n${signoff}`,
      };
    case "refund_issued":
      // Deliberately no tracking id here, even if input.trackingId is set.
      return {
        whatsappText:
          `${greeting} A refund has been issued for your order ${orderNumber} from ${storeName}.${amount} Please allow a few business days for it to appear on your statement. ${signoff}`,
        emailSubject: `Refund issued for your order ${orderNumber} — ${storeName}`,
        emailBody:
          `${greeting}\n\nA refund has been issued for your order ${orderNumber} from ${storeName}.${amount} Please allow a few business days for it to appear on your statement.\n\n${signoff}`,
      };
    case "cod_tracking": {
      const tracking = input.trackingId
        ? ` Your tracking ID is ${input.trackingId}${input.courier ? ` via ${input.courier}` : ""}.`
        : "";
      return {
        whatsappText:
          `${greeting} Your cash-on-delivery order ${orderNumber} from ${storeName} is on its way.${tracking} Please keep the exact amount ready when the courier arrives.${amount} ${signoff}`,
        emailSubject: `Tracking for your cash-on-delivery order ${orderNumber} — ${storeName}`,
        emailBody:
          `${greeting}\n\nYour cash-on-delivery order ${orderNumber} from ${storeName} is on its way.${tracking} Please keep the exact amount ready when the courier arrives.${amount}\n\n${signoff}`,
      };
    }
  }
}

/**
 * Build the WhatsApp text, email subject, and email body for an event.
 * Returns messages for every event; which channel(s) to actually send on
 * is decided separately by selectChannels().
 *
 * Throws a clear Error when orderNumber or storeName is missing/blank —
 * a notification without an order reference or store identity is never
 * useful and would look like spam. Missing customer contact details do
 * NOT throw here; they are handled by selectChannels() skipping the
 * channel that lacks a contact.
 */
export function buildMessage(
  event: OrderEvent,
  input: OrderNotifyInput
): BuiltMessage {
  if (!input.orderNumber || !input.orderNumber.trim()) {
    throw new Error("buildMessage: orderNumber is required");
  }
  if (!input.storeName || !input.storeName.trim()) {
    throw new Error("buildMessage: storeName is required");
  }
  return defaultMessages(event, input);
}

/**
 * Build a message from merchant-customised templates when a rule provides
 * them. Custom whatsappTemplate replaces the WhatsApp text and custom
 * emailSubject replaces the email subject; the email body keeps the
 * default copy (merchants customise the subject line, not the body, in
 * this version). Falls back to buildMessage() when no custom template
 * is given. Same validation as buildMessage().
 */
export function buildMessageFromRule(
  rule: NotifyRule,
  input: OrderNotifyInput
): BuiltMessage {
  const base = buildMessage(rule.event, input);
  const vars = varsOf(input);
  return {
    whatsappText: rule.whatsappTemplate
      ? renderTemplate(rule.whatsappTemplate, vars)
      : base.whatsappText,
    emailSubject: rule.emailSubject
      ? renderTemplate(rule.emailSubject, vars)
      : base.emailSubject,
    emailBody: base.emailBody,
  };
}

export interface ChannelAvailability {
  /** True when a usable WhatsApp contact (phone) is on file for this order. */
  whatsapp: boolean;
  /** True when a usable email address is on file for this order. */
  email: boolean;
}

/**
 * Decide which channel(s) to send on for an event.
 *
 * - No rule for the event → [] (nothing configured, nothing sent).
 * - Rule disabled → [].
 * - rule.channel 'whatsapp' → ['whatsapp'] only if available.whatsapp,
 *   otherwise [] (contact missing → channel skipped, not an error).
 * - rule.channel 'email' → same for email.
 * - rule.channel 'both' → whichever of the available channels exist;
 *   degrades to a single channel when only one contact is available,
 *   and to [] when neither is.
 *
 * The caller derives `available` from the order (e.g.
 * `{ whatsapp: isValidPhoneE164(order.customerPhone ?? ""),
 *     email: Boolean(order.customerEmail) }`). This function never
 * invents a contact and never throws for a missing one.
 */
export function selectChannels(
  rules: NotifyRule[],
  event: OrderEvent,
  available: ChannelAvailability
): ("whatsapp" | "email")[] {
  const rule = rules.find((r) => r.event === event);
  if (!rule || !rule.enabled) return [];
  const wanted: ("whatsapp" | "email")[] =
    rule.channel === "both"
      ? ["whatsapp", "email"]
      : [rule.channel];
  return wanted.filter((ch) => available[ch]);
}
