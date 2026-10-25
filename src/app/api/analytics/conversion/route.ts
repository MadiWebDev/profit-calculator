/**
 * GET /api/analytics/conversion — funnel views → add-to-cart →
 * checkout → purchase, per product and per traffic source, combined
 * with order profit (profit per visitor, high-traffic/low-profit flag).
 * When no ConversionEvent rows exist, trackingEnabled=false and the
 * page shows the enable-conversion-tracking state (see
 * docs/MANUAL_STEPS.md for the ShopifyQL / pixel install steps).
 * POST ingests funnel events (authenticated; used by the pixel app
 * extension or a manual import — never stores customer PII).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import { getReportContext, loadReportOrders, csvResponse } from "@/lib/report-server";
import { summarizeOrders } from "@/lib/parity-reports";
import ConversionEventModel from "@/models/ConversionEvent";

const EventSchema = z.object({
  storeId: z.string().min(1).max(64),
  productId: z.string().max(200).optional(),
  productName: z.string().max(300).optional(),
  source: z.string().max(200).optional(),
  sessionKey: z.string().min(1).max(200),
  step: z.enum(["view", "add_to_cart", "checkout", "purchase"]),
  occurredAt: z.string().optional(),
}).strict();

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "analytics-conversion");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;

  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);

  await connectDB();
  const eventFilter: Record<string, unknown> = {
    teamId: toObjectId(ctx.session.teamId),
    occurredAt: { $gte: ctx.from, $lte: ctx.to },
  };
  if (ctx.storeId) eventFilter.storeId = toObjectId(ctx.storeId);
  const events = await ConversionEventModel.find(eventFilter).lean();

  const sessions = new Set(events.map((e) => e.sessionKey));
  const stepCount = (s: string) => events.filter((e) => e.step === s).length;
  const funnel = {
    views: stepCount("view"),
    addToCart: stepCount("add_to_cart"),
    checkout: stepCount("checkout"),
    purchase: stepCount("purchase"),
    visitors: sessions.size,
  };

  const byProduct = new Map<string, { product: string; views: number; addToCart: number; checkout: number; purchase: number }>();
  for (const e of events) {
    const key = e.productName ?? e.productId ?? "Unknown product";
    const cur = byProduct.get(key) ?? { product: key, views: 0, addToCart: 0, checkout: 0, purchase: 0 };
    if (e.step === "view") cur.views += 1;
    if (e.step === "add_to_cart") cur.addToCart += 1;
    if (e.step === "checkout") cur.checkout += 1;
    if (e.step === "purchase") cur.purchase += 1;
    byProduct.set(key, cur);
  }
  // Profit per product from orders (line items), for the same period.
  const profitByProduct = new Map<string, { revenue: number; profit: number }>();
  for (const o of orders) {
    if ((o.status ?? "fulfilled") === "cancelled") continue;
    for (const li of o.lineItems ?? []) {
      const cur = profitByProduct.get(li.name ?? "Unknown") ?? { revenue: 0, profit: 0 };
      cur.revenue += (li.price ?? 0) * (li.quantity ?? 0);
      cur.profit += ((li.price ?? 0) - (li.cogs ?? 0)) * (li.quantity ?? 0);
      profitByProduct.set(li.name ?? "Unknown", cur);
    }
  }
  const rows = [...byProduct.values()].map((r) => {
    const p = profitByProduct.get(r.product) ?? { revenue: 0, profit: 0 };
    const visitors = Math.max(r.views, 1);
    const margin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100 * 100) / 100 : 0;
    return {
      ...r,
      revenue: Math.round(p.revenue * 100) / 100,
      grossProfit: Math.round(p.profit * 100) / 100,
      margin,
      conversionRate: r.views > 0 ? Math.round((r.purchase / r.views) * 100 * 100) / 100 : 0,
      profitPerVisitor: Math.round((p.profit / visitors) * 100) / 100,
      flag: r.views >= 100 && margin < 10 ? "High traffic, low profit" : "",
    };
  }).sort((a, b) => b.views - a.views);

  const bySource = new Map<string, number>();
  for (const e of events) {
    if (e.step !== "view") continue;
    bySource.set(e.source ?? "Unknown", (bySource.get(e.source ?? "Unknown") ?? 0) + 1);
  }

  if (ctx.format === "csv") {
    return csvResponse(
      "conversion.csv",
      "product,views,addToCart,checkout,purchase,conversionRate,revenue,grossProfit,profitPerVisitor,flag",
      rows.map((r) => [r.product, r.views, r.addToCart, r.checkout, r.purchase, r.conversionRate, r.revenue, r.grossProfit, r.profitPerVisitor, `"${r.flag}"`].join(",")),
    );
  }

  return NextResponse.json({
    totals: {
      ...totals,
      visitors: funnel.visitors,
      profitPerVisitor: funnel.visitors > 0 ? Math.round((totals.netProfit / funnel.visitors) * 100) / 100 : 0,
    },
    rows, funnel,
    sources: [...bySource.entries()].map(([source, views]) => ({ source, views })),
    trackingEnabled: events.length > 0,
    currencies: [...new Set(orders.map((o) => o.currency ?? "USD"))],
  });
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "conversion-post" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;
  const parsed = await parseBody(req, EventSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  if (!/^[a-f0-9]{24}$/i.test(b.storeId)) {
    return NextResponse.json({ error: "Invalid storeId" }, { status: 400 });
  }
  await connectDB();
  const ev = await ConversionEventModel.create({
    teamId: toObjectId(session.teamId),
    storeId: toObjectId(b.storeId),
    productId: b.productId,
    productName: b.productName,
    source: b.source,
    sessionKey: b.sessionKey,
    step: b.step,
    occurredAt: b.occurredAt ? new Date(b.occurredAt) : new Date(),
  });
  return NextResponse.json({ id: ev._id.toString() }, { status: 201 });
}
