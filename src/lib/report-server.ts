/** Server-side helpers shared by parity API routes. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseQuery, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import type { ReportOrderInput } from "@/lib/parity-reports";
import {
  convertAmount,
  convertOrdersToBase,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";

export const ReportQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    storeId: z.string().optional(),
    currency: z.string().optional(),
    format: z.enum(["json", "csv"]).default("json"),
    granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  })
  .strict();

export interface ReportContext {
  session: { userId: string; teamId: string; plan: string; role: string; teamRole: unknown; email: string };
  from: Date;
  to: Date;
  storeId?: string;
  currency?: string;
  format: "json" | "csv";
  granularity: "daily" | "weekly" | "monthly";
}

/** Auth + date-range parsing shared by every parity report route. */
export async function getReportContext(req: Request, key: string): Promise<{ ctx: ReportContext } | { response: NextResponse }> {
  const authed = await requireAuth(req, { rateLimitKey: key });
  if (authed instanceof NextResponse) return { response: authed };
  const { session } = authed;
  const parsed = parseQuery(req, ReportQuerySchema);
  if ("response" in parsed) return { response: parsed.response };
  const q = parsed.data;
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 864e5);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return { response: NextResponse.json({ error: "Invalid date range", code: "BAD_REQUEST" }, { status: 400 }) };
  }
  to.setHours(23, 59, 59, 999);
  if (q.storeId && !/^[a-f0-9]{24}$/i.test(q.storeId)) {
    return { response: NextResponse.json({ error: "Invalid storeId", code: "BAD_REQUEST" }, { status: 400 }) };
  }
  return {
    ctx: {
      session: session as ReportContext["session"],
      from, to,
      storeId: q.storeId,
      currency: q.currency?.toUpperCase(),
      format: q.format,
      granularity: q.granularity,
    },
  };
}

export function orderFilter(ctx: ReportContext): Record<string, unknown> {
  const f: Record<string, unknown> = {
    teamId: toObjectId(ctx.session.teamId),
    orderDate: { $gte: ctx.from, $lte: ctx.to },
  };
  if (ctx.storeId) f.storeId = toObjectId(ctx.storeId);
  if (ctx.currency) f.currency = ctx.currency;
  return f;
}

/**
 * Load orders for a report, mapped to the parity engine input shape.
 *
 * Every order is converted into the report's base currency BEFORE the
 * engine sums anything: the explicit `currency` filter when given
 * (orders are already single-currency then, so conversion is a no-op),
 * otherwise the team's most common store currency (or the selected
 * store's currency). Without this, a multi-currency team got 1:1 sums
 * labelled with one currency. On an FX failure orders pass through
 * unconverted rather than failing the report.
 */
export async function loadReportOrders(ctx: ReportContext): Promise<ReportOrderInput[]> {
  await connectDB();
  const docs = await OrderModel.find(orderFilter(ctx)).lean();
  const base = ctx.currency ?? (await getReportBaseCurrency(ctx.session.teamId, ctx.storeId));
  const rates = await getReportRates(base, ctx.session.teamId);
  const converted = convertOrdersToBase(
    docs.map((o) => ({
      currency: o.currency,
      grossRevenue: o.grossRevenue ?? 0,
      discounts: o.discounts ?? 0,
      shippingRevenue: o.shippingRevenue ?? 0,
      shippingCost: o.shippingCost ?? 0,
      totalCogs: o.totalCogs ?? 0,
      transactionFees: o.transactionFees ?? 0,
      taxes: o.taxes ?? 0,
      refundAmount: o.refundAmount ?? 0,
      chargebackAmount: o.chargebackAmount ?? 0,
      adSpendAllocated: o.adSpendAllocated ?? 0,
      otherCosts: o.otherCosts ?? 0,
    })),
    base,
    rates,
  );
  return docs.map((o, i) => {
    const c = converted[i];
    const from = o.currency ?? base;
    const conv = (v?: number | null) => convertAmount(v ?? 0, from, base, rates);
    return {
      currency: base,
      grossRevenue: c.grossRevenue,
      discounts: c.discounts,
      shippingRevenue: c.shippingRevenue,
      shippingCost: c.shippingCost,
      totalCogs: c.totalCogs,
      transactionFees: c.transactionFees,
      taxes: c.taxes,
      refundAmount: c.refundAmount,
      chargebackAmount: c.chargebackAmount,
      adSpendAllocated: c.adSpendAllocated,
      otherCosts: c.otherCosts,
      packagingCost: conv(o.packagingCost),
      codFee: conv(o.codFee),
      subscriptionShare: conv(o.subscriptionShare),
      rtoLoss: conv(o.rtoLoss),
      expenseAllocation: conv(o.expenseAllocation),
      taxMode: o.taxMode,
      orderDate: o.orderDate,
      status: o.status,
      shippingCountry: o.shippingCountry,
      shippingCity: o.shippingCity,
      source: o.source,
      utmCampaign: o.utmCampaign,
      paymentMethod: o.paymentMethod,
      riskBand: o.riskBand,
      fulfillmentStatus: o.fulfillmentStatus,
      lineItems: (o.lineItems ?? []).map((li: { productId?: string; name?: string; price?: number; cogs?: number; quantity?: number }) => ({
        productId: li.productId, name: li.name, price: conv(li.price), cogs: conv(li.cogs), quantity: li.quantity,
      })),
    };
  });
}

export function csvResponse(filename: string, header: string, rows: string[]): NextResponse {
  return new NextResponse([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
