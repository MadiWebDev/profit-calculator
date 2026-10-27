/**
 * Monthly Expenses — CRUD for recurring/one-off operating costs.
 * GET also returns the amount allocated into the requested period
 * (per-day overlap, see parity-reports.ts) and profit before/after
 * operating expenses for that period, so the P&L effect is visible
 * without changing the core profit formula.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import { getReportContext, loadReportOrders } from "@/lib/report-server";
import { summarizeOrders, allocateMonthlyExpenses } from "@/lib/parity-reports";
import MonthlyExpenseModel from "@/models/MonthlyExpense";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  amount: z.number().min(0).max(1_000_000_000),
  currency: z.string().length(3).default("USD"),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  isRecurring: z.boolean().default(false),
  taxInclusive: z.boolean().default(false),
  allocation: z.enum(["per_day", "per_order", "by_revenue"]).default("per_day"),
  notes: z.string().max(500).optional(),
}).strict();

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "monthly-expenses");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  await connectDB();
  const expenses = await MonthlyExpenseModel.find({ teamId: toObjectId(ctx.session.teamId), isActive: true }).sort({ startDate: -1 }).lean();
  const allocated = allocateMonthlyExpenses(
    expenses.map((e) => ({ amount: e.amount, currency: e.currency, startDate: e.startDate, endDate: e.endDate, allocation: e.allocation })),
    ctx.from, ctx.to,
  );
  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);
  return NextResponse.json({
    expenses: expenses.map((e) => ({ ...e, id: e._id.toString() })),
    allocated,
    profitBeforeOpex: totals.netProfit,
    profitAfterOpex: Math.round((totals.netProfit - allocated) * 100) / 100,
    totals,
  });
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "monthly-expenses-post" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  await connectDB();
  const doc = await MonthlyExpenseModel.create({
    teamId: toObjectId(session.teamId),
    name: b.name, category: b.category, amount: b.amount, currency: b.currency,
    startDate: new Date(b.startDate), endDate: b.endDate ? new Date(b.endDate) : null,
    isRecurring: b.isRecurring, taxInclusive: b.taxInclusive, allocation: b.allocation, notes: b.notes,
  });
  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}
