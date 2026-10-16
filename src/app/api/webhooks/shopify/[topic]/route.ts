/**
 * POST /api/webhooks/shopify/[topic]
 *
 * Receives Shopify webhooks. Excluded from the auth middleware matcher —
 * authenticity is established by HMAC-SHA256 of the RAW body
 * (X-Shopify-Hmac-Sha256) compared with crypto.timingSafeEqual.
 *
 * Topics (registered on connect — see src/lib/sync/shopify.ts):
 *   GDPR (mandatory):  customers-data_request | customers-redact | shop-redact
 *   Orders:            orders-create | orders-updated | orders-cancelled | refunds-create
 *
 * Every handler is idempotent: order webhooks upsert by the unique
 * (teamId, storeId, externalId) index; GDPR handlers are safe to replay.
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { upsertShopifyOrder, type ShopifyOrder } from "@/lib/sync/shopify";
import { logger, toLogError } from "@/lib/logger";

const ALLOWED_TOPICS = new Set([
  "customers-data_request",
  "customers-redact",
  "shop-redact",
  "orders-create",
  "orders-updated",
  "orders-cancelled",
  "refunds-create",
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

  try {
    switch (topic) {
      case "customers-data_request": {
        // We store only order-level email/customerId — no customer PII vault.
        // Return an empty data set; the 200 acknowledges within Shopify's window.
        logger.info("shopify GDPR data_request", { shopDomain });
        return NextResponse.json({ data: [] });
      }

      case "customers-redact": {
        // payload: { customer: { id }, shop_domain }
        const customer = payload.customer as { id?: number } | undefined;
        const domain = ((payload.shop_domain as string) ?? shopDomain).toLowerCase();
        if (customer?.id && domain) {
          const store = await StoreModel.findOne({ domain, platform: "shopify" }).select("_id").lean();
          if (store) {
            await OrderModel.updateMany(
              { storeId: store._id, customerId: String(customer.id) },
              { $unset: { customerEmail: "" } }
            );
            logger.info("shopify GDPR customer redacted", { domain });
          }
        }
        return NextResponse.json({ received: true });
      }

      case "shop-redact": {
        // payload: { shop_domain } — 48h after uninstall. Delete all shop data.
        const domain = ((payload.shop_domain as string) ?? shopDomain).toLowerCase();
        if (domain) {
          const store = await StoreModel.findOne({ domain, platform: "shopify" });
          if (store) {
            await OrderModel.deleteMany({ storeId: store._id });
            store.accessToken = undefined;
            store.refreshToken = undefined;
            store.isActive = false;
            store.syncStatus = "never";
            await store.save();
            logger.info("shopify GDPR shop redacted", { domain });
          }
        }
        return NextResponse.json({ received: true });
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
          return NextResponse.json({ received: true });
        }
        await upsertShopifyOrder(
          payload as unknown as ShopifyOrder,
          store._id.toString(),
          (store.teamId as mongoose.Types.ObjectId).toString(),
          store.currency ?? "USD"
        );
        logger.info("shopify order webhook upserted", { topic });
        return NextResponse.json({ received: true });
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
            await OrderModel.findOneAndUpdate(
              {
                teamId: store.teamId,
                storeId: store._id,
                externalId: String(orderId),
              },
              { $inc: { refundAmount: refundDelta } }
            );
            logger.info("shopify refund webhook applied", { orderId });
          }
        }
        return NextResponse.json({ received: true });
      }

      default:
        return NextResponse.json({ received: true });
    }
  } catch (e) {
    // Return 500 so Shopify retries; the handlers are idempotent.
    logger.error("shopify webhook handler failed", toLogError(e), { topic });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
