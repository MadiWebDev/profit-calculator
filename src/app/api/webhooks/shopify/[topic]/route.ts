/**
 * POST /api/webhooks/shopify/[topic]
 *
 * Receives Shopify webhooks. Excluded from the auth middleware matcher —
 * authenticity is established by HMAC-SHA256 of the RAW body
 * (X-Shopify-Hmac-Sha256) compared with crypto.timingSafeEqual.
 *
 * Topics (registered on connect — see src/lib/sync/shopify.ts):
 *   GDPR (mandatory):  customers-data_request | customers-redact | shop-redact
 *   App:               app-uninstalled
 *   Orders:            orders-create | orders-updated | orders-cancelled | refunds-create
 *   Fulfillment:       fulfillments-create | fulfillments-update
 *   Catalogue:         products-update
 *
 * Every handler is idempotent: order webhooks upsert by the unique
 * (teamId, storeId, externalId) index; deliveries are deduplicated by
 * X-Shopify-Webhook-Id via claimWebhookEvent (a redelivery after a
 * crash is reprocessed exactly once, a processed delivery is skipped);
 * GDPR handlers are safe to replay. Handlers return 500 on failure so
 * Shopify retries; the dedup claim guarantees the retry is safe.
 */
import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import ProductModel from "@/models/Product";
import { upsertShopifyOrder, type ShopifyOrder } from "@/lib/sync/shopify";
import { claimWebhookEvent, finishWebhookEvent } from "@/lib/webhook-dedup";
import { compileCustomerDataExport } from "@/lib/gdpr-export";
import { sendGdprExportEmail } from "@/lib/email";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { logger, toLogError } from "@/lib/logger";

const ALLOWED_TOPICS = new Set([
  "customers-data_request",
  "customers-redact",
  "shop-redact",
  "app-uninstalled",
  "orders-create",
  "orders-updated",
  "orders-cancelled",
  "refunds-create",
  "fulfillments-create",
  "fulfillments-update",
  "products-update",
]);

interface RouteParams {
  params: Promise<{ topic: string }>;
}

function verifyShopifyHmac(rawBody: string, headerHmac: string | null): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !headerHmac) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(headerHmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Test seam — exported for unit tests. */
export { verifyShopifyHmac };

/** Recompute an order's profit after a refund changes its refund total. */
export function recomputeProfitAfterRefund(order: {
  grossRevenue: number;
  refundAmount: number;
  chargebackAmount: number;
  totalCogs: number;
  shippingCost: number;
  transactionFees: number;
  adSpendAllocated: number;
}): { netRevenue: number; netProfit: number; profitMargin: number } {
  const netRevenue = order.grossRevenue - order.refundAmount - order.chargebackAmount;
  const netProfit =
    netRevenue - order.totalCogs - order.shippingCost - order.transactionFees - order.adSpendAllocated;
  return {
    netRevenue: Math.round(netRevenue * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: netRevenue > 0 ? Math.round((netProfit / netRevenue) * 100 * 100) / 100 : 0,
  };
}

export async function POST(req: Request, { params }: RouteParams) {
  const { topic } = await params;
  if (!ALLOWED_TOPICS.has(topic)) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 404 });
  }

  const rawBody = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const shopDomain = req.headers.get("x-shopify-shop-domain")?.toLowerCase() ?? "";

  if (!verifyShopifyHmac(rawBody, hmac)) {
    logger.warn("shopify webhook rejected: bad HMAC", { topic });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await connectDB();

  // Deduplicate deliveries (Shopify retries at-least-once). Deliveries
  // without an id header (e.g. local tests) are processed normally.
  const webhookId = req.headers.get("x-shopify-webhook-id");
  let eventId: string | null = null;
  if (webhookId) {
    eventId = `shopify:${webhookId}`;
    try {
      const claim = await claimWebhookEvent({ eventId, source: "shopify", eventType: topic });
      if (claim === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    } catch (e) {
      // Dedup must never block ingestion: log and continue unclaimed.
      logger.warn("shopify webhook dedup failed (continuing)", {}, toLogError(e));
      eventId = null;
    }
  }

  try {
    switch (topic) {
      case "customers-data_request": {
        // payload: { customer: { id, email }, shop_domain }
        // Compile the customer's order records and email the export to
        // the store owner (Shopify's contact for the requester, who
        // forwards it). The 200 acknowledges within Shopify's window;
        // a failed email is logged loudly, not swallowed — the export
        // counts stay in the log for manual follow-up.
        const customer = payload.customer as { id?: number; email?: string } | undefined;
        const domain = ((payload.shop_domain as string) ?? shopDomain).toLowerCase();
        const store = domain
          ? await StoreModel.findOne({ domain, platform: "shopify" }).select("_id teamId").lean()
          : null;
        if (store && (customer?.id || customer?.email)) {
          const data = await compileCustomerDataExport({
            storeId: store._id,
            shopDomain: domain,
            customerId: customer?.id ? String(customer.id) : undefined,
            customerEmail: customer?.email,
          });
          let ownerEmail: string | null = null;
          if (store.teamId) {
            const team = await TeamModel.findById(store.teamId).select("ownerId").lean();
            if (team?.ownerId) {
              const owner = await UserModel.findById(team.ownerId).select("email").lean();
              ownerEmail = owner?.email ?? null;
            }
          }
          if (ownerEmail) {
            try {
              await sendGdprExportEmail(ownerEmail, domain, customer?.email ?? `customer ${customer?.id}`, data);
              logger.info("shopify GDPR data_request exported", { domain, orders: data.orders.length });
            } catch (e) {
              logger.error("shopify GDPR data_request email failed", e instanceof Error ? e : new Error("email failed"), { domain, orders: data.orders.length });
            }
          } else {
            logger.warn("shopify GDPR data_request: no owner email, export logged only", { domain, orders: data.orders.length });
          }
        } else {
          logger.info("shopify GDPR data_request: no matching store/customer", { domain });
        }
        break;
      }

      case "customers-redact": {
        // payload: { customer: { id }, shop_domain }
        // Redaction must cover ALL customer PII we hold on orders, not
        // just the email: name, phone, shipping/billing locality and
        // the stored browser IP are unset as well.
        const customer = payload.customer as { id?: number } | undefined;
        const domain = ((payload.shop_domain as string) ?? shopDomain).toLowerCase();
        if (customer?.id && domain) {
          const store = await StoreModel.findOne({ domain, platform: "shopify" }).select("_id").lean();
          if (store) {
            await OrderModel.updateMany(
              { storeId: store._id, customerId: String(customer.id) },
              { $unset: {
                customerEmail: "", customerName: "", customerPhone: "",
                shippingCity: "", shippingPostalCode: "", shippingCountry: "",
                billingCity: "", billingPostalCode: "", billingCountry: "",
                browserIp: "",
              } }
            );
            logger.info("shopify GDPR customer redacted", { domain });
          }
        }
        break;
      }

      case "shop-redact": {
        // payload: { shop_domain } — 48h after uninstall. Delete all shop data.
        const domain = ((payload.shop_domain as string) ?? shopDomain).toLowerCase();
        if (domain) {
          const store = await StoreModel.findOne({ domain, platform: "shopify" });
          if (store) {
            await OrderModel.deleteMany({ storeId: store._id });
            await ProductModel.deleteMany({ storeId: store._id });
            store.accessToken = undefined;
            store.refreshToken = undefined;
            store.isActive = false;
            store.syncStatus = "disconnected";
            await store.save();
            logger.info("shopify GDPR shop redacted", { domain });
          }
        }
        break;
      }

      case "app-uninstalled": {
        // Immediate deactivation (GDPR shop-redact follows 48h later and
        // deletes the data). Never delete on uninstall alone: the merchant
        // may reinstall, and GDPR gives a defined deletion window.
        const domain = shopDomain;
        if (domain) {
          const store = await StoreModel.findOne({ domain, platform: "shopify" });
          if (store) {
            store.accessToken = undefined;
            store.refreshToken = undefined;
            store.isActive = false;
            store.syncStatus = "disconnected";
            store.syncError = "App uninstalled — reconnect to resume sync.";
            await store.save();
            logger.info("shopify app uninstalled", { domain });
          }
        }
        break;
      }

      case "orders-create":
      case "orders-updated":
      case "orders-cancelled": {
        const store = await StoreModel.findOne({
          domain: shopDomain,
          platform: "shopify",
          isActive: true,
        });
        if (!store) {
          logger.warn("shopify order webhook: unknown store", { shopDomain });
          break;
        }
        await upsertShopifyOrder(
          payload as unknown as ShopifyOrder,
          store._id.toString(),
          (store.teamId as mongoose.Types.ObjectId).toString(),
          store.currency ?? "USD"
        );
        logger.info("shopify order webhook upserted", { topic });
        // Phase 4: score the order after the response is sent. Scoring
        // never blocks ingestion; a failure is logged, not retried here
        // (the merchant can re-score from the review queue).
        const teamIdForScoring = (store.teamId as mongoose.Types.ObjectId).toString();
        const storeIdForScoring = store._id.toString();
        const externalIdForScoring = String((payload as { id?: number }).id ?? "");
        // Phase 9a: customer notification after the response is sent.
        // Only creates (confirmed) and cancellations notify — generic
        // updates do not, or customers would be spammed on every edit.
        if (topic === "orders-create" || topic === "orders-cancelled") {
          const notifyEvent = topic === "orders-create" ? "order_confirmed" : "cancelled";
          const teamIdForNotify = (store.teamId as mongoose.Types.ObjectId).toString();
          const storeIdForNotify = store._id.toString();
          const externalIdForNotify = String((payload as { id?: number }).id ?? "");
          after(async () => {
            try {
              const { sendOrderNotification } = await import("@/lib/notify-server");
              const saved = await OrderModel.findOne({
                teamId: teamIdForNotify,
                storeId: storeIdForNotify,
                externalId: externalIdForNotify,
              }).select("_id").lean();
              if (saved) await sendOrderNotification(saved._id.toString(), teamIdForNotify, notifyEvent);
            } catch (e) {
              logger.warn("order notification after webhook failed (non-fatal)", {}, toLogError(e));
            }
          });
        }
        after(async () => {
          try {
            const { scoreAndTagOrder } = await import("@/lib/risk-scoring");
            const saved = await OrderModel.findOne({
              teamId: teamIdForScoring,
              storeId: storeIdForScoring,
              externalId: externalIdForScoring,
            }).select("_id").lean();
            if (saved) await scoreAndTagOrder(saved._id.toString(), teamIdForScoring);
          } catch (e) {
            logger.warn("risk scoring after webhook failed (non-fatal)", {}, toLogError(e));
          }
        });
        break;
      }

      case "refunds-create": {
        // payload: { order_id, transactions: [{ amount }] }
        const orderId = payload.order_id as number | undefined;
        const transactions = (payload.transactions as { amount?: string }[] | undefined) ?? [];
        const store = await StoreModel.findOne({
          domain: shopDomain,
          platform: "shopify",
          isActive: true,
        });
        if (store && orderId) {
          const refundDelta = transactions.reduce((s, t) => {
            const n = parseFloat(t.amount ?? "0");
            return s + (Number.isFinite(n) ? n : 0);
          }, 0);
          if (refundDelta > 0) {
            // Increment first, then recompute profit from the stored row so
            // a redelivery (deduped above) or a concurrent refund cannot
            // double-count: profit is always derived, never incremented.
            await OrderModel.findOneAndUpdate(
              {
                teamId: store.teamId,
                storeId: store._id,
                externalId: String(orderId),
              },
              { $inc: { refundAmount: refundDelta } }
            );
            const order = await OrderModel.findOne({
              teamId: store.teamId,
              storeId: store._id,
              externalId: String(orderId),
            }).lean();
            if (order) {
              const recomputed = recomputeProfitAfterRefund({
                grossRevenue: order.grossRevenue ?? 0,
                refundAmount: order.refundAmount ?? 0,
                chargebackAmount: order.chargebackAmount ?? 0,
                totalCogs: order.totalCogs ?? 0,
                shippingCost: order.shippingCost ?? 0,
                transactionFees: order.transactionFees ?? 0,
                adSpendAllocated: order.adSpendAllocated ?? 0,
              });
              await OrderModel.updateOne(
                { _id: order._id },
                { $set: { ...recomputed, status: "refunded" } }
              );
            }
            logger.info("shopify refund webhook applied", { orderId });
            // Phase 9a: refund notification (never includes tracking).
            const teamIdForRefundNotify = (store.teamId as mongoose.Types.ObjectId).toString();
            after(async () => {
              try {
                const { sendOrderNotification } = await import("@/lib/notify-server");
                const saved = await OrderModel.findOne({
                  teamId: teamIdForRefundNotify,
                  storeId: store._id,
                  externalId: String(orderId),
                }).select("_id").lean();
                if (saved) await sendOrderNotification(saved._id.toString(), teamIdForRefundNotify, "refund_issued");
              } catch (e) {
                logger.warn("refund notification after webhook failed (non-fatal)", {}, toLogError(e));
              }
            });
          }
        }
        break;
      }

      case "fulfillments-create":
      case "fulfillments-update": {
        // payload: { order_id, tracking_number, tracking_company,
        //            status, shipment_status }
        const orderId = payload.order_id as number | undefined;
        const store = await StoreModel.findOne({
          domain: shopDomain,
          platform: "shopify",
          isActive: true,
        });
        if (store && orderId) {
          const trackingNumber = payload.tracking_number as string | undefined;
          const trackingCompany = payload.tracking_company as string | undefined;
          const fulfillmentStatus =
            (payload.shipment_status as string | undefined) ??
            (payload.status as string | undefined);
          const update: Record<string, unknown> = {};
          if (fulfillmentStatus) update.fulfillmentStatus = fulfillmentStatus;
          if (trackingNumber) update.trackingNumber = trackingNumber;
          if (trackingCompany) update.trackingCompany = trackingCompany;
          if (Object.keys(update).length > 0) {
            await OrderModel.findOneAndUpdate(
              { teamId: store.teamId, storeId: store._id, externalId: String(orderId) },
              { $set: update }
            );
            logger.info("shopify fulfillment webhook applied", { topic, orderId });
            // Phase 9a: shipment-stage notification (incl. COD tracking
            // substitution inside sendOrderNotification).
            const teamIdForFulfillNotify = (store.teamId as mongoose.Types.ObjectId).toString();
            const fulfillmentEventStatus = fulfillmentStatus;
            after(async () => {
              try {
                const { sendOrderNotification, fulfillmentStatusToEvent } = await import("@/lib/notify-server");
                const event = fulfillmentStatusToEvent(fulfillmentEventStatus);
                if (!event) return;
                const saved = await OrderModel.findOne({
                  teamId: teamIdForFulfillNotify,
                  storeId: store._id,
                  externalId: String(orderId),
                }).select("_id").lean();
                if (saved) await sendOrderNotification(saved._id.toString(), teamIdForFulfillNotify, event);
              } catch (e) {
                logger.warn("fulfillment notification after webhook failed (non-fatal)", {}, toLogError(e));
              }
            });
          }
        }
        break;
      }

      case "products-update": {
        // payload: { id, title, status } — keep the local catalogue name /
        // active flag in step; COGS and variants come from the GraphQL
        // cost fetch and the COGS editor, not from this payload.
        const productId = payload.id as number | undefined;
        const store = await StoreModel.findOne({
          domain: shopDomain,
          platform: "shopify",
          isActive: true,
        });
        if (store && productId) {
          const update: Record<string, unknown> = {};
          if (typeof payload.title === "string") update.name = payload.title;
          if (typeof payload.status === "string") update.isActive = payload.status === "active";
          if (Object.keys(update).length > 0) {
            await ProductModel.findOneAndUpdate(
              { teamId: store.teamId, storeId: store._id, externalId: String(productId) },
              { $set: update }
            );
          }
        }
        break;
      }

      default:
        break;
    }
    if (eventId) await finishWebhookEvent(eventId, { status: "processed" }).catch(() => undefined);
    return NextResponse.json({ received: true });
  } catch (e) {
    // Return 500 so Shopify retries; the handlers are idempotent and the
    // dedup claim is left as "failed" so the retry reprocesses exactly once.
    if (eventId) {
      await finishWebhookEvent(eventId, {
        status: "failed",
        error: e instanceof Error ? e.message : "webhook handler failed",
      }).catch(() => undefined);
    }
    logger.error("shopify webhook handler failed", toLogError(e), { topic });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
