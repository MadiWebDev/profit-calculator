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
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";
import { sendScheduledReportEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

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
    // Scheduled-report totals sum order money; convert each order into
    // the team base currency first.
    const srBase = await getReportBaseCurrency(r.teamId);
    const srRates = await getReportRates(srBase);
    const totals = summarizeOrders(docs.map((o) => {
      const conv = (v?: number) => convertAmount(v ?? 0, o.currency, srBase, srRates);
      return {
        currency: srBase,
        grossRevenue: conv(o.grossRevenue), discounts: conv(o.discounts), shippingRevenue: conv(o.shippingRevenue),
        shippingCost: conv(o.shippingCost), totalCogs: conv(o.totalCogs), transactionFees: conv(o.transactionFees),
        taxes: conv(o.taxes), refundAmount: conv(o.refundAmount), chargebackAmount: conv(o.chargebackAmount),
        adSpendAllocated: conv(o.adSpendAllocated), otherCosts: conv(o.otherCosts), packagingCost: conv(o.packagingCost),
        codFee: conv(o.codFee), subscriptionShare: conv(o.subscriptionShare), rtoLoss: conv(o.rtoLoss),
        expenseAllocation: conv(o.expenseAllocation), orderDate: o.orderDate, status: o.status,
      };
    }));
    // lastSentAt is stamped ONLY on a confirmed send. WhatsApp has no
    // sender anywhere in this route, so a WhatsApp-only report must
    // never be stamped delivered — it is logged and flagged as unsent
    // instead (previously every due report was stamped, so a
    // WhatsApp-only schedule silently looked delivered forever).
    let delivered = false;
    if (r.channel === "whatsapp") {
      logger.warn("scheduled-report: WhatsApp channel has no sender; report not sent", {
        reportId: r._id.toString(),
        name: r.name,
      });
      skipped.push(`${r.name} (whatsapp not implemented — no sender configured)`);
      continue;
    }
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
        delivered = true;
      } catch {
        skipped.push(`${r.name} (email failed)`);
        continue;
      }
    }
    if (delivered) {
      await ScheduledReportModel.updateOne({ _id: r._id }, { lastSentAt: now });
    }
  }
  return NextResponse.json({ sent, skipped, runAt: now.toISOString() });
}
