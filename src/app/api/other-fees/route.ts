/**
 * Other Fees — CRUD for per-order / per-percent fee rules with
 * effective dates and country / product-tag / payment-method scoping.
 * GET also previews the fee each rule would charge on the current
 * period's orders, so a rule is never saved blind.
 *
 * Rules are APPLIED, not just previewed: P&L deducts them as an
 * "Other fees" operating expense and the profit API adds each
 * order's fee into its otherCosts before computing metrics (see
 * src/lib/other-fees.ts for the matching + currency contract).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import { getReportContext, loadReportOrders } from "@/lib/report-server";
import { getReportBaseCurrency, getReportRates } from "@/lib/report-currency";
import { computeOtherFees } from "@/lib/other-fees";
import { deriveMoneyCurrency } from "@/lib/money-currency-server";
import OtherFeeRuleModel from "@/models/OtherFeeRule";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  feeType: z.string().trim().min(1).max(100),
  kind: z.enum(["percent", "fixed_per_order"]),
  value: z.number().min(0).max(100000),
  // Currency the fixed fee is denominated in. No silent USD default:
  // when the client sends none, derive it (user display currency >
  // team > store). Percent fees ignore it (share of order value).
  currency: z.string().length(3).toUpperCase().optional(),
  country: z.string().max(200).optional(),
  productTag: z.string().max(200).optional(),
  paymentMethod: z.string().max(200).optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional().nullable(),
}).strict();

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "other-fees");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  await connectDB();
  const rules = await OtherFeeRuleModel.find({ teamId: toObjectId(ctx.session.teamId), isActive: true }).sort({ feeType: 1 }).lean();
  const orders = await loadReportOrders(ctx);
  // Orders arrive converted into the report base; fixed fees are
  // converted from each rule's currency into the same base.
  const base = ctx.currency ?? (await getReportBaseCurrency(ctx.session.teamId, ctx.storeId));
  const rates = await getReportRates(base, ctx.session.teamId);
  const { perRule } = computeOtherFees(
    rules.map((r) => ({
      kind: r.kind, value: r.value, currency: r.currency,
      country: r.country, productTag: r.productTag, paymentMethod: r.paymentMethod,
      effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
    })),
    orders.map((o) => ({
      grossRevenue: o.grossRevenue, shippingCountry: o.shippingCountry,
      paymentMethod: o.paymentMethod, orderDate: o.orderDate, status: o.status,
      lineItems: (o.lineItems ?? []).map((li) => ({ tags: (li as { tags?: string[] }).tags ?? null })),
    })),
    { baseCurrency: base, rates },
  );
  return NextResponse.json({
    rules: rules.map((r, i) => ({
      ...r, id: r._id.toString(),
      preview: perRule[i] ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "other-fees-post" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  await connectDB();
  const currency = b.currency ?? (await deriveMoneyCurrency({ userId: session.userId, teamId: session.teamId }));
  if (b.kind === "fixed_per_order" && !currency) {
    // A fixed fee with no denominated currency would be summed 1:1
    // and labelled as base currency — reject instead of guessing.
    // (Percent fees need no currency: they are a share of order value.)
    return fail("Currency is required — set a display currency, a team currency, or connect a store", 400, "CURRENCY_REQUIRED");
  }
  const doc = await OtherFeeRuleModel.create({
    teamId: toObjectId(session.teamId),
    name: b.name, feeType: b.feeType, kind: b.kind, value: b.value, currency,
    country: b.country, productTag: b.productTag, paymentMethod: b.paymentMethod,
    effectiveFrom: new Date(b.effectiveFrom), effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
  });
  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}
