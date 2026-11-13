/**
 * Server helper: allocate a team's monthly/operating expenses into a
 * reporting period, in the report base currency.
 *
 * Used by GET /api/monthly-expenses and by P&L getPnlData so both
 * surfaces show the SAME allocated total: the monthly amount is
 * prorated per calendar month (see allocateMonthlyExpenses) and
 * converted from each expense's own currency into the report base.
 *
 * per_order / by_revenue expenses need full-month order totals, so
 * the helper loads the period's orders plus the rest of the edge
 * months (one extra order query over at most period + 2 months) and
 * builds per-month stats. Callers must already be connected to the
 * database.
 */
import { toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import MonthlyExpenseModel from "@/models/MonthlyExpense";
import {
  allocateMonthlyExpenses,
  type ExpenseMonthStats,
} from "@/lib/parity-reports";
import {
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";
import { loadReportOrders, type ReportContext } from "@/lib/report-server";

export interface AllocatedMonthlyExpenses {
  allocated: number;
  baseCurrency: string;
}

export async function getAllocatedMonthlyExpenses(
  ctx: ReportContext,
): Promise<AllocatedMonthlyExpenses> {
  await connectDB();
  const teamId = toObjectId(ctx.session.teamId);
  const base = ctx.currency ?? (await getReportBaseCurrency(ctx.session.teamId, ctx.storeId));
  const rates = await getReportRates(base, ctx.session.teamId);
  const expenses = await MonthlyExpenseModel.find({ teamId, isActive: true })
    .sort({ startDate: -1 })
    .lean();

  // Full-month order stats for the calendar months the period touches,
  // so per_order / by_revenue shares divide by the whole month's
  // orders/revenue — not just the part inside the period.
  let monthStats: Record<string, ExpenseMonthStats> | undefined;
  if (expenses.some((e) => e.allocation === "per_order" || e.allocation === "by_revenue")) {
    const firstMonth = new Date(Date.UTC(ctx.from.getUTCFullYear(), ctx.from.getUTCMonth(), 1));
    const lastMonthEnd = new Date(
      Date.UTC(ctx.to.getUTCFullYear(), ctx.to.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const monthOrders = await loadReportOrders({
      ...ctx,
      from: firstMonth,
      to: lastMonthEnd,
    });
    const stats: Record<string, ExpenseMonthStats> = {};
    for (const o of monthOrders) {
      if ((o.status ?? "fulfilled") === "cancelled") continue;
      const d = new Date(o.orderDate);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const cur = stats[key] ?? { orders: 0, revenue: 0, overlapOrders: 0, overlapRevenue: 0 };
      cur.orders += 1;
      cur.revenue += o.grossRevenue;
      if (d >= ctx.from && d <= ctx.to) {
        cur.overlapOrders += 1;
        cur.overlapRevenue += o.grossRevenue;
      }
      stats[key] = cur;
    }
    monthStats = stats;
  }

  const allocated = allocateMonthlyExpenses(
    expenses.map((e) => ({
      amount: e.amount,
      currency: e.currency,
      startDate: e.startDate,
      endDate: e.endDate,
      isRecurring: e.isRecurring,
      allocation: e.allocation,
    })),
    ctx.from,
    ctx.to,
    { baseCurrency: base, rates, monthStats },
  );
  return { allocated, baseCurrency: base };
}
