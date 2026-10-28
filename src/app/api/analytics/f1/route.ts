import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/validation";
import OrderModel from "@/models/Order";
import { discountProfitability, returnsAnalytics, marketBasket, type F1Order } from "@/lib/f1-engines";

/**
 * GET /api/analytics/f1 — F1.2/F1.3/F1.4 over the last 90 days (max 5000
 * orders, team-scoped). Honest limitation: orders do not store a
 * discount CODE (only the discount total), so per-code rows are empty
 * until Shopify discount-code sync is added — the discount totals and
 * the returns/basket analyses are real. See FINAL_REPORT_V3.
 */
export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  await connectDB();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const orders = await OrderModel.find({ teamId: toObjectId(session.teamId), orderDate: { $gte: since }, status: { $ne: "cancelled" } })
    .sort({ orderDate: -1 }).limit(5000).lean();
  const mapped: F1Order[] = orders.map((o) => ({
    id: o._id.toString(),
    revenue: o.grossRevenue ?? 0,
    netProfit: o.netProfit ?? 0,
    cogs: o.totalCogs ?? 0,
    refundAmount: o.refundAmount ?? 0,
    status: o.status,
    country: o.shippingCountry,
    discountCode: null,
    discountAmount: o.discounts ?? 0,
    productIds: (o.lineItems ?? []).map((li: { productId?: string; sku?: string; name: string }) => li.productId ?? li.sku ?? li.name),
    productId: o.lineItems?.[0]?.productId ?? o.lineItems?.[0]?.sku,
  }));
  return NextResponse.json({
    windowDays: 90,
    orderCount: mapped.length,
    discounts: discountProfitability(mapped),
    returns: returnsAnalytics(mapped),
    basket: marketBasket(mapped),
    discountCodeNote: "Per-code breakdown requires discount-code sync (not stored on orders today); discount totals above are real.",
  });
}
