import OrderModel from "@/models/Order";
import type mongoose from "mongoose";

/**
 * Shopify GDPR customers/data_request — compile what we hold about one
 * customer. Previously this handler only logged and returned an empty
 * data set, which does not satisfy Shopify's data-request obligation.
 *
 * What we hold: order-level records keyed by platform customer id and/or
 * customer email (no separate customer PII vault). The export contains
 * the customer's own order records only — never another customer's rows,
 * never merchant secrets or tokens, and never merchant-internal
 * analytics (profit, COGS, risk scores, ad-spend allocation). Delivery
 * is to the store owner (who is Shopify's contact for the requester);
 * see the webhook route.
 */
export interface CustomerDataExport {
  shopDomain: string;
  customer: { id?: string; email?: string };
  orders: {
    orderNumber?: string;
    createdAt?: Date;
    status?: string;
    netRevenue?: number;
    currency?: string;
    customerName?: string;
    customerPhone?: string;
    shippingCity?: string;
    shippingCountry?: string;
    billingCity?: string;
    billingCountry?: string;
    browserIp?: string;
    lineItems: { name?: string; quantity?: number; price?: number }[];
  }[];
}

export async function compileCustomerDataExport(args: {
  storeId: mongoose.Types.ObjectId;
  shopDomain: string;
  customerId?: string;
  customerEmail?: string;
}): Promise<CustomerDataExport> {
  const or: Record<string, unknown>[] = [];
  if (args.customerId) or.push({ customerId: String(args.customerId) });
  if (args.customerEmail) or.push({ customerEmail: args.customerEmail.toLowerCase() });
  const orders = or.length
    ? await OrderModel.find({ storeId: args.storeId, $or: or })
        .select("orderNumber createdAt status netRevenue currency customerName customerPhone shippingCity shippingCountry billingCity billingCountry browserIp lineItems")
        .sort({ createdAt: 1 })
        .lean()
    : [];
  type Row = {
    orderNumber?: string; createdAt?: Date; status?: string; netRevenue?: number; currency?: string;
    customerName?: string; customerPhone?: string; shippingCity?: string; shippingCountry?: string;
    billingCity?: string; billingCountry?: string; browserIp?: string;
    lineItems?: { name?: string; quantity?: number; price?: number }[];
  };
  return {
    shopDomain: args.shopDomain,
    customer: { id: args.customerId, email: args.customerEmail },
    orders: (orders as Row[]).map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status,
      netRevenue: o.netRevenue,
      currency: o.currency,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      shippingCity: o.shippingCity,
      shippingCountry: o.shippingCountry,
      billingCity: o.billingCity,
      billingCountry: o.billingCountry,
      browserIp: o.browserIp,
      lineItems: (o.lineItems ?? []).map((li) => ({
        name: li.name,
        quantity: li.quantity,
        price: li.price,
      })),
    })),
  };
}
