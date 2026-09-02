import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import ProductModel from "@/models/Product";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import { calcPeriodSummary, calcTaxSetAside } from "@/lib/profit-engine";
import mongoose from "mongoose";

function toCSV(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "profit_summary";
  const from = new Date(searchParams.get("from") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const to   = new Date(searchParams.get("to") ?? new Date().toISOString().slice(0, 10));
  to.setHours(23, 59, 59, 999);

  await connectDB();
  const teamOid = mongoose.Types.ObjectId.createFromHexString(user.teamId);

  let csv = "";

  if (type === "profit_summary") {
    const orders = await OrderModel.find({ teamId: teamOid, orderDate: { $gte: from, $lte: to }, status: { $ne: "cancelled" } }).lean();
    const summary = calcPeriodSummary(orders.map((o) => ({
      grossRevenue: o.grossRevenue, discounts: o.discounts, shippingRevenue: o.shippingRevenue,
      shippingCost: o.shippingCost, totalCogs: o.totalCogs, transactionFees: o.transactionFees,
      taxes: o.taxes, refundAmount: o.refundAmount, chargebackAmount: o.chargebackAmount, adSpendAllocated: o.adSpendAllocated,
    })));
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
    csv = toCSV([
      ["Order #", "Date", "Status", "Revenue", "Discounts", "COGS", "Shipping Cost", "Fees", "Refund", "Ad Spend", "Net Profit", "Margin %"],
      ...orders.map((o) => [
        o.orderNumber ?? o.externalId, o.orderDate.toISOString().slice(0, 10), o.status,
        o.grossRevenue.toFixed(2), o.discounts.toFixed(2), o.totalCogs.toFixed(2),
        o.shippingCost.toFixed(2), o.transactionFees.toFixed(2), o.refundAmount.toFixed(2),
        o.adSpendAllocated.toFixed(2), o.netProfit.toFixed(2), o.profitMargin.toFixed(2),
      ]),
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
    const summary = calcPeriodSummary(orders.map((o) => ({
      grossRevenue: o.grossRevenue, discounts: o.discounts, shippingRevenue: o.shippingRevenue,
      shippingCost: o.shippingCost, totalCogs: o.totalCogs, transactionFees: o.transactionFees,
      taxes: o.taxes, refundAmount: o.refundAmount, chargebackAmount: o.chargebackAmount, adSpendAllocated: o.adSpendAllocated,
    })));
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
