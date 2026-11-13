/**
 * Gateways — payment gateways detected from orders, plus editable
 * fee schedules (percent + fixed, per gateway and per currency, with
 * effective dates and COD handling). GET returns a recompute preview:
 * what the saved fee schedule would charge on the period's orders,
 * next to what was actually recorded as transaction fees.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import { getReportContext, loadReportOrders } from "@/lib/report-server";
import { summarizeOrders } from "@/lib/parity-reports";
import { convertAmount, getReportBaseCurrency, getReportRates } from "@/lib/report-currency";
import GatewayFeeModel from "@/models/GatewayFee";
import { deriveMoneyCurrency } from "@/lib/money-currency-server";

const CreateSchema = z.object({
  gateway: z.string().trim().min(1).max(120),
  // No silent USD default: when the client sends no currency, the
  // server derives it (user display currency > team > store).
  currency: z.string().length(3).toUpperCase().optional(),
  percent: z.number().min(0).max(100),
  fixed: z.number().min(0).max(10000),
  codHandling: z.string().max(120).default("collect_on_delivery"),
  payoutDelayDays: z.number().int().min(0).max(365).default(0),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional().nullable(),
}).strict();

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "gateways");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  await connectDB();
  const fees = await GatewayFeeModel.find({ teamId: toObjectId(ctx.session.teamId), isActive: true }).lean();
  const orders = await loadReportOrders(ctx);
  const totals = summarizeOrders(orders);
  // The preview is in the report base currency (orders arrive
  // converted into it by loadReportOrders), so the rule's fixed fee —
  // denominated in the RULE's currency — must be converted into the
  // base before it is added. The percent is currency-agnostic.
  const base = ctx.currency ?? (await getReportBaseCurrency(ctx.session.teamId, ctx.storeId));
  const rates = await getReportRates(base, ctx.session.teamId);

  const byGateway = new Map<string, { orders: number; revenue: number; recordedFees: number }>();
  for (const o of orders) {
    if ((o.status ?? "fulfilled") === "cancelled") continue;
    const g = o.paymentMethod ?? "Unknown";
    const cur = byGateway.get(g) ?? { orders: 0, revenue: 0, recordedFees: 0 };
    cur.orders += 1;
    cur.revenue += o.grossRevenue;
    cur.recordedFees += o.transactionFees;
    byGateway.set(g, cur);
  }
  const gateways = [...byGateway.entries()].map(([gateway, v]) => {
    // Rule lookup is by gateway AND currency: with two rules for one
    // gateway in different currencies the first match used to win
    // arbitrarily. Prefer a rule denominated in the base currency;
    // otherwise the latest-effective rule. A rule only applies when
    // its effective window overlaps the period — a future-dated or
    // expired rule no longer previews against the last 30 days.
    const candidates = fees
      .filter((f) => f.gateway.toLowerCase() === gateway.toLowerCase())
      .filter((f) => {
        const from = new Date(f.effectiveFrom);
        if (Number.isNaN(from.getTime()) || from > ctx.to) return false;
        if (f.effectiveTo) {
          const to = new Date(f.effectiveTo);
          if (!Number.isNaN(to.getTime()) && to < ctx.from) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aBase = (a.currency ?? "").toUpperCase() === base ? 0 : 1;
        const bBase = (b.currency ?? "").toUpperCase() === base ? 0 : 1;
        if (aBase !== bBase) return aBase - bBase;
        return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
      });
    const rule = candidates[0];
    const fixedInBase = rule
      ? convertAmount(rule.fixed, rule.currency, base, rates)
      : 0;
    const recomputed = rule
      ? Math.round(((v.revenue * rule.percent) / 100 + v.orders * fixedInBase) * 100) / 100
      : null;
    return {
      gateway, ...v,
      revenue: Math.round(v.revenue * 100) / 100,
      recordedFees: Math.round(v.recordedFees * 100) / 100,
      rule: rule ? { percent: rule.percent, fixed: rule.fixed, currency: rule.currency, payoutDelayDays: rule.payoutDelayDays, codHandling: rule.codHandling } : null,
      recomputed,
      delta: recomputed === null ? null : Math.round((recomputed - v.recordedFees) * 100) / 100,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({ gateways, totals, feeRules: fees.map((f) => ({ ...f, id: f._id.toString() })) });
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "gateways-post" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  await connectDB();
  const currency = b.currency ?? (await deriveMoneyCurrency({ userId: session.userId, teamId: session.teamId }));
  if (!currency) {
    return fail("Currency is required — set a display currency, a team currency, or connect a store", 400, "CURRENCY_REQUIRED");
  }
  const doc = await GatewayFeeModel.create({
    teamId: toObjectId(session.teamId),
    gateway: b.gateway, currency, percent: b.percent, fixed: b.fixed,
    codHandling: b.codHandling, payoutDelayDays: b.payoutDelayDays,
    effectiveFrom: new Date(b.effectiveFrom), effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
  });
  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}
