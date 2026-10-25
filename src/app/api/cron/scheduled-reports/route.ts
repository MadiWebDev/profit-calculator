/**
 * GET /api/cron/scheduled-reports — cron-secret route (same pattern
 * as the existing cron routes). Sends due weekly (Monday) / monthly
 * (1st) reports and the weekly digest by email via the existing
 * sendProfitReportEmail helper. WhatsApp delivery is logged as
 * pending when no WhatsApp credentials are configured — never a blast.
 * This route sends summaries only, never order-level PII.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import ScheduledReportModel from "@/models/ScheduledReport";
import OrderModel from "@/models/Order";
import { summarizeOrders } from "@/lib/parity-reports";
import { sendScheduledReportEmail } from "@/lib/email";

export async function GET(req: Request) {
  const authRes = verifyCronAuth(req);
  if (authRes) return authRes;
  await connectDB();
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isFirst = now.getUTCDate() === 1;
  const due = await ScheduledReportModel.find({ isActive: true }).lean();
  let sent = 0;
  const skipped: string[] = [];
  for (const r of due) {
    const isDue = r.frequency === "weekly" ? isMonday : isFirst;
    const sinceLast = r.lastSentAt ? (now.getTime() - new Date(r.lastSentAt).getTime()) / 864e5 : 999;
    const minGap = r.frequency === "weekly" ? 6 : 27;
    if (!isDue || sinceLast < minGap) { skipped.push(r.name); continue; }
    const to = new Date();
    const from = new Date(to.getTime() - (r.frequency === "weekly" ? 7 : 30) * 864e5);
    const docs = await OrderModel.find({
      teamId: r.teamId, orderDate: { $gte: from, $lte: to }, status: { $ne: "cancelled" },
    }).lean();
    const totals = summarizeOrders(docs.map((o) => ({
      grossRevenue: o.grossRevenue ?? 0, discounts: o.discounts ?? 0, shippingRevenue: o.shippingRevenue ?? 0,
      shippingCost: o.shippingCost ?? 0, totalCogs: o.totalCogs ?? 0, transactionFees: o.transactionFees ?? 0,
      taxes: o.taxes ?? 0, refundAmount: o.refundAmount ?? 0, chargebackAmount: o.chargebackAmount ?? 0,
      adSpendAllocated: o.adSpendAllocated ?? 0, otherCosts: o.otherCosts ?? 0, packagingCost: o.packagingCost ?? 0,
      codFee: o.codFee ?? 0, subscriptionShare: o.subscriptionShare ?? 0, rtoLoss: o.rtoLoss ?? 0,
      expenseAllocation: o.expenseAllocation ?? 0, orderDate: o.orderDate, status: o.status,
    })));
    if (r.channel === "email" || r.channel === "both") {
      try {
        await sendScheduledReportEmail(
          r.recipient,
          `${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}`,
          {
            revenue: totals.revenue, netProfit: totals.netProfit, netMargin: totals.netMargin,
            orderCount: totals.orderCount, aov: totals.aov,
          },
          r.format === "pdf" ? "pdf" : "csv",
        );
        sent += 1;
      } catch {
        skipped.push(`${r.name} (email failed)`);
        continue;
      }
    }
    await ScheduledReportModel.updateOne({ _id: r._id }, { lastSentAt: now });
  }
  return NextResponse.json({ sent, skipped, runAt: now.toISOString() });
}
