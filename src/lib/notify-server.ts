/**
 * Phase 9a server bridge: order notifications via WhatsApp Cloud API
 * and email (Resend), driven by the pure whatsapp.ts templates/rules.
 *
 * Safety rules (all documented, all tested by the absence of a send):
 * - No rule for the event, or a disabled rule → nothing sent, logged
 *   as skipped. A merchant who never configured notifications gets
 *   zero messages, never a default-on blast.
 * - Missing contact → that channel is skipped, not an error; "both"
 *   degrades to the available channel (whatsapp.ts selectChannels).
 * - Missing WhatsApp credentials → WhatsApp skipped with a logged
 *   reason; email still sends when configured.
 * - Dedup: a "sent" NotificationLog row for (team, order, event,
 *   channel) blocks a second send, so a redelivered webhook or a
 *   second trigger source cannot double-message a customer.
 * - COD tracking: when the order is COD and the cod_tracking rule is
 *   enabled, a shipment event sends cod_tracking (tracking ID +
 *   courier + COD wording) instead of the generic order_shipped
 *   message. Otherwise the generic shipped message is used.
 * - Cancelled/refund messages never include a tracking ID, even when
 *   one exists on the order (enforced in whatsapp.ts templates).
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import NotifyRuleModel from "@/models/NotifyRule";
import NotificationLogModel from "@/models/NotificationLog";
import {
  buildMessageFromRule,
  selectChannels,
  isValidPhoneE164,
  type OrderEvent,
  type NotifyRule,
} from "@/lib/whatsapp";
import { sendOrderNotificationEmail } from "@/lib/email";
import { logger, toLogError } from "@/lib/logger";

export interface NotifyOutcome {
  event: OrderEvent;
  channels: ("whatsapp" | "email")[];
  skipped: string[];
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

function isCodOrder(order: { paymentMethod?: string }): boolean {
  return (order.paymentMethod ?? "").toLowerCase().includes("cod")
    || (order.paymentMethod ?? "").toLowerCase().includes("cash on delivery");
}

/**
 * Send one WhatsApp text via the Meta WhatsApp Cloud API. Returns
 * { ok: false, skipped: true } when credentials are missing (caller
 * logs it as skipped, not failed) and { ok: false } on API errors.
 * The fetch implementation is injectable for tests.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `WhatsApp API HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "WhatsApp send failed" };
  }
}

/**
 * Send the notification for one order + event. Resolves the event
 * (COD tracking substitution), the merchant's rule, the channels,
 * and dedup, then sends and logs each channel. Never throws for a
 * missing rule/contact/credential — those are "skipped", logged, and
 * reported in the outcome. Throws only for a missing order.
 */
export async function sendOrderNotification(
  orderId: string,
  teamId: string,
  event: OrderEvent
): Promise<NotifyOutcome> {
  await connectDB();
  const order = await OrderModel.findOne({
    _id: orderId,
    teamId: new mongoose.Types.ObjectId(teamId),
  }).lean();
  if (!order) throw new Error("Order not found");

  // COD tracking substitution: a COD shipment with an enabled
  // cod_tracking rule sends the COD message instead of generic shipped.
  let resolvedEvent = event;
  if (event === "order_shipped" && isCodOrder(order) && order.trackingNumber) {
    const codRule = await NotifyRuleModel.findOne({ teamId: order.teamId, event: "cod_tracking" }).lean();
    if (codRule?.enabled) resolvedEvent = "cod_tracking";
  }

  const ruleDoc = await NotifyRuleModel.findOne({ teamId: order.teamId, event: resolvedEvent }).lean();
  const skipped: string[] = [];
  if (!ruleDoc || !ruleDoc.enabled) {
    return { event: resolvedEvent, channels: [], skipped: [`no enabled rule for ${resolvedEvent}`] };
  }
  const rule: NotifyRule = {
    event: resolvedEvent,
    channel: ruleDoc.channel,
    enabled: ruleDoc.enabled,
    whatsappTemplate: ruleDoc.whatsappTemplate,
    emailSubject: ruleDoc.emailSubject,
  };
  const store = order.storeId
    ? await StoreModel.findById(order.storeId).select("name").lean()
    : null;
  const message = buildMessageFromRule(rule, {
    orderNumber: order.orderNumber ?? `#${order.externalId ?? ""}`,
    customerName: order.customerName ?? order.customerEmail ?? "Customer",
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    trackingId: order.trackingNumber,
    courier: order.trackingCompany,
    amount: order.grossRevenue,
    currency: order.currency,
    storeName: store?.name ?? "Your store",
  });
  const channels = selectChannels([rule], resolvedEvent, {
    whatsapp: isValidPhoneE164(order.customerPhone ?? ""),
    email: Boolean(order.customerEmail),
  });
  if (channels.length === 0) {
    await NotificationLogModel.create({
      teamId: order.teamId, orderId: order._id, event: resolvedEvent,
      channel: rule.channel === "email" ? "email" : "whatsapp",
      recipientMasked: "", status: "skipped", error: "no usable contact for the configured channel",
    }).catch(() => undefined);
    return { event: resolvedEvent, channels: [], skipped: ["no usable contact for the configured channel"] };
  }

  const sent: ("whatsapp" | "email")[] = [];
  for (const channel of channels) {
    const alreadySent = await NotificationLogModel.findOne({
      teamId: order.teamId, orderId: order._id, event: resolvedEvent, channel, status: "sent",
    }).lean();
    if (alreadySent) {
      skipped.push(`${channel} already sent`);
      continue;
    }
    try {
      if (channel === "whatsapp") {
        const result = await sendWhatsAppMessage((order.customerPhone ?? "").trim(), message.whatsappText);
        if (!result.ok) {
          if (result.skipped) {
            skipped.push(`whatsapp: ${result.error ?? "not configured"}`);
            await NotificationLogModel.create({
              teamId: order.teamId, orderId: order._id, event: resolvedEvent, channel,
              recipientMasked: maskPhone(order.customerPhone ?? ""), status: "skipped", error: result.error,
            }).catch(() => undefined);
            continue;
          }
          throw new Error(result.error ?? "WhatsApp send failed");
        }
        await NotificationLogModel.create({
          teamId: order.teamId, orderId: order._id, event: resolvedEvent, channel,
          recipientMasked: maskPhone(order.customerPhone ?? ""), status: "sent",
        }).catch(() => undefined);
        sent.push("whatsapp");
      } else {
        await sendOrderNotificationEmail(order.customerEmail!, message.emailSubject, message.emailBody);
        await NotificationLogModel.create({
          teamId: order.teamId, orderId: order._id, event: resolvedEvent, channel,
          recipientMasked: maskEmail(order.customerEmail ?? ""), status: "sent",
        }).catch(() => undefined);
        sent.push("email");
      }
    } catch (e) {
      logger.error("order notification failed", toLogError(e), { orderId, event: resolvedEvent, channel });
      await NotificationLogModel.create({
        teamId: order.teamId, orderId: order._id, event: resolvedEvent, channel,
        recipientMasked: channel === "whatsapp" ? maskPhone(order.customerPhone ?? "") : maskEmail(order.customerEmail ?? ""),
        status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "send failed",
      }).catch(() => undefined);
      skipped.push(`${channel} failed`);
    }
  }
  return { event: resolvedEvent, channels: sent, skipped };
}

/**
 * Map a Shopify shipment_status / fulfillment status to a notify
 * event, or null when it is not a customer-facing stage.
 */
export function fulfillmentStatusToEvent(status: string | undefined | null): OrderEvent | null {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "in_transit" || s === "in transit" || s === "shipped") return "order_shipped";
  if (s === "out_for_delivery" || s === "out for delivery") return "out_for_delivery";
  if (s === "delivered") return "delivered";
  return null;
}
