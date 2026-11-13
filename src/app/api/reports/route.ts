import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseQuery, fail, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import ProductModel from "@/models/Product";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { calcTaxSetAside, calcOrderProfit } from "@/lib/profit-engine";
import { neutralizeCsvCell } from "@/lib/csv-injection";
import { normalizeReportOrders } from "@/lib/reporting";

const ReportsQuerySchema = z
  .object({
    type: z.enum(["profit_summary", "order_detail", "product_performance", "product_margin", "ad_spend", "tax_estimate"]).default("profit_summary"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict();

function toCSV(rows: string[][]): string {
  // S3/R7: neutralize formula cells before quoting, so a merchant/order
  // value starting with =, +, - or @ cannot execute in Excel/Sheets.
  return rows.map((r) => r.map((c) => `"${neutralizeCsvCell(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET(req: NextRequest) {
  const authed = await requireAuth(req, { rateLimitKey: "reports-get" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const q = parseQuery(req, ReportsQuerySchema);
  if ("response" in q) return q.response;

  const from = new Date(q.data.from ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const to = new Date(q.data.to ?? new Date().toISOString().slice(0, 10));
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return fail("Invalid date range", 400, "VALIDATION_ERROR");
  }
  if (to.getTime() - from.getTime() > 366 * 864e5) {
    return fail("Date range cannot exceed 366 days", 400, "VALIDATION_ERROR");
  }
  to.setHours(23, 59, 59, 999);
  const type = q.data.type;

  await connectDB();
  const teamOid = toObjectId(session.teamId);

  let csv = "";

  if (type === "profit_summary") {
    const orders = await OrderModel.find({ teamId: teamOid, orderDate: { $gte: from, $lte: to }, status: { $ne: "cancelled" } }).lean();
    const summary = (await normalizeReportOrders(orders.map((o) => ({
      currency: o.currency,
      grossRevenue: o.grossRevenue, discounts: o.discounts, shippingRevenue: o.shippingRevenue,
      shippingCost: o.shippingCost, totalCogs: o.totalCogs, transactionFees: o.transactionFees,
      taxes: o.taxes, refundAmount: o.refundAmount, chargebackAmount: o.chargebackAmount, adSpendAllocated: o.adSpendAllocated,
    })), session.teamId)).summary;
    csv = toCSV([
      ["Metric", "Value"],
      ["Period", `${from.toDateString()} — ${to.toDateString()}`],
      ["Total Revenue", summary.totalRevenue.toFixed(2)],
      ["Total COGS", summary.totalCogs.toFixed(2)],
      ["Gross Profit", summary.grossProfit.toFixed(2)],
      ["Gross Margin %", summary.grossMargin.toFixed(2)],
      ["Total Ad Spend", summary.totalAdSpend.toFixed(2)],
      ["Net Profit", summary.netProfit.toFixed(2)],
      ["Net Margin %", summary.netMargin.toFixed(2)],
      ["Total Refunds", summary.totalRefunds.toFixed(2)],
      ["Order Count", String(summary.orderCount)],
      ["Avg Order Value", summary.avgOrderValue.toFixed(2)],
    ]);
  }

  else if (type === "order_detail") {
    const orders = await OrderModel.find({ teamId: teamOid, orderDate: { $gte: from, $lte: to } }).lean();
    // Convert each row per-order into the base currency BEFORE writing
    // it — the old code wrote raw stored values, so a multi-currency
    // team got 1:1 mixed-currency rows with no currency column at all.
    // Same normalizeReportOrders path as profit_summary / tax_estimate
    // in this file; `normalized` is aligned with `orders`. Net profit
    // and margin are recomputed from the CONVERTED costs (so the row
    // is internally consistent), which also subsumes the stored
    // profitMargin guard — that field is no longer read here.
    const n = (v: unknown): number =>
      typeof v === "number" && Number.isFinite(v) ? v : 0;
    const { normalized, baseCurrency } = await normalizeReportOrders(orders.map((o) => ({
      currency: o.currency,
      grossRevenue: n(o.grossRevenue), discounts: n(o.discounts), shippingRevenue: n(o.shippingRevenue),
      shippingCost: n(o.shippingCost), totalCogs: n(o.totalCogs), transactionFees: n(o.transactionFees),
      taxes: n(o.taxes), refundAmount: n(o.refundAmount), chargebackAmount: n(o.chargebackAmount), adSpendAllocated: n(o.adSpendAllocated),
    })), session.teamId);
    csv = toCSV([
      ["Order #", "Date", "Status", "Revenue", "Discounts", "COGS", "Shipping Cost", "Fees", "Refund", "Ad Spend", "Net Profit", "Margin %", "Order Currency", "Amounts Currency"],
      ...orders.map((o, i) => {
        const c = normalized[i];
        const profit = calcOrderProfit(c);
        return [
          o.orderNumber ?? o.externalId ?? "",
          o.orderDate ? new Date(o.orderDate).toISOString().slice(0, 10) : "",
          o.status ?? "",
          c.grossRevenue.toFixed(2), c.discounts.toFixed(2), c.totalCogs.toFixed(2),
          c.shippingCost.toFixed(2), c.transactionFees.toFixed(2), c.refundAmount.toFixed(2),
          c.adSpendAllocated.toFixed(2), profit.netProfit.toFixed(2), profit.netMargin.toFixed(2),
          typeof o.currency === "string" && o.currency ? o.currency.toUpperCase() : baseCurrency,
          baseCurrency,
        ];
      }),
    ]);
  }

  else if (type === "product_margin") {
    const products = await ProductModel.find({ teamId: teamOid }).lean();
    csv = toCSV([
      ["Product", "SKU", "COGS", "Revenue", "Net Profit", "Margin %", "Orders"],
      ...products.map((p) => [
        p.name, p.sku ?? "", p.defaultCogs.toFixed(2),
        p.totalRevenue.toFixed(2), p.totalProfit.toFixed(2),
        p.avgProfitMargin.toFixed(2), String(p.totalOrders),
      ]),
    ]);
  }

  else if (type === "ad_spend") {
    const ads = await AdSpendDailyModel.find({ teamId: teamOid, date: { $gte: from, $lte: to } }).lean();
    csv = toCSV([
      ["Date", "Platform", "Campaign", "Ad Set", "Ad", "Spend", "Impressions", "Clicks", "Conversions", "Revenue", "ROAS", "CPA"],
      ...ads.map((a) => [
        a.date.toISOString().slice(0, 10), a.platform,
        a.campaignName ?? "", a.adSetName ?? "", a.adName ?? "",
        a.spend.toFixed(2), String(a.impressions), String(a.clicks),
        String(a.conversions), a.revenueAttributed.toFixed(2),
        a.roas.toFixed(2), a.cpa.toFixed(2),
      ]),
    ]);
  }

  else if (type === "tax_estimate") {
    const orders = await OrderModel.find({ teamId: teamOid, orderDate: { $gte: from, $lte: to }, status: { $ne: "cancelled" } }).lean();
    const summary = (await normalizeReportOrders(orders.map((o) => ({
      currency: o.currency,
      grossRevenue: o.grossRevenue, discounts: o.discounts, shippingRevenue: o.shippingRevenue,
      shippingCost: o.shippingCost, totalCogs: o.totalCogs, transactionFees: o.transactionFees,
      taxes: o.taxes, refundAmount: o.refundAmount, chargebackAmount: o.chargebackAmount, adSpendAllocated: o.adSpendAllocated,
    })), session.teamId)).summary;
    const tax = calcTaxSetAside(summary.netProfit, 0.28);
    csv = toCSV([
      ["Item", "Amount"],
      ["Period", `${from.toDateString()} — ${to.toDateString()}`],
      ["Net Profit", summary.netProfit.toFixed(2)],
      ["Estimated Tax Rate", "28%"],
      ["Tax Set-Aside", tax.taxSetAside.toFixed(2)],
      ["After-Tax Profit", tax.afterTaxProfit.toFixed(2)],
      ["Quarterly Payment Estimate", tax.quarterlyPayment.toFixed(2)],
      ["", ""],
      ["DISCLAIMER", "This is an estimate only. Consult a qualified tax professional."],
    ]);
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="profitcalc-${type}-report.csv"`,
    },
  });
}
