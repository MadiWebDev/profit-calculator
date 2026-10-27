/**
 * Other Fees — CRUD for per-order / per-percent fee rules with
 * effective dates and country / product-tag / payment-method scoping.
 * GET also previews the fee each rule would charge on the current
 * period's orders, so a rule is never saved blind.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import { getReportContext, loadReportOrders } from "@/lib/report-server";
import OtherFeeRuleModel from "@/models/OtherFeeRule";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  feeType: z.string().trim().min(1).max(100),
  kind: z.enum(["percent", "fixed_per_order"]),
  value: z.number().min(0).max(100000),
  country: z.string().max(200).optional(),
  productTag: z.string().max(200).optional(),
  paymentMethod: z.string().max(200).optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional().nullable(),
}).strict();

export function previewFee(
  rule: { kind: string; value: number; country?: string; paymentMethod?: string },
  orders: { grossRevenue: number; shippingCountry?: string; paymentMethod?: string; orderDate: Date | string; status?: string }[],
): number {
  let total = 0;
  for (const o of orders) {
    if ((o.status ?? "fulfilled") === "cancelled") continue;
    if (rule.country && (o.shippingCountry ?? "") !== rule.country) continue;
    if (rule.paymentMethod && (o.paymentMethod ?? "") !== rule.paymentMethod) continue;
    total += rule.kind === "percent" ? (o.grossRevenue * rule.value) / 100 : rule.value;
  }
  return Math.round(total * 100) / 100;
}

export async function GET(req: Request) {
  const ctxRes = await getReportContext(req, "other-fees");
  if ("response" in ctxRes) return ctxRes.response;
  const ctx = ctxRes.ctx;
  await connectDB();
  const rules = await OtherFeeRuleModel.find({ teamId: toObjectId(ctx.session.teamId), isActive: true }).sort({ feeType: 1 }).lean();
  const orders = await loadReportOrders(ctx);
  return NextResponse.json({
    rules: rules.map((r) => ({
      ...r, id: r._id.toString(),
      preview: previewFee({ kind: r.kind, value: r.value, country: r.country, paymentMethod: r.paymentMethod }, orders),
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
  const doc = await OtherFeeRuleModel.create({
    teamId: toObjectId(session.teamId),
    name: b.name, feeType: b.feeType, kind: b.kind, value: b.value,
    country: b.country, productTag: b.productTag, paymentMethod: b.paymentMethod,
    effectiveFrom: new Date(b.effectiveFrom), effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
  });
  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}
