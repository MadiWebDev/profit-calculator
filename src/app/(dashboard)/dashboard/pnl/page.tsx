import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import OtherFeeRuleModel from "@/models/OtherFeeRule";
import { PnlClient } from "./PnlClient";
import mongoose from "mongoose";
import {
  convertAmount,
  convertOrdersToBase,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";
import { parseDateRange } from "@/lib/dates";
import { getAllocatedMonthlyExpenses } from "@/lib/monthly-expenses-server";
import { computeOtherFees } from "@/lib/other-fees";
import type { ReportContext } from "@/lib/report-server";

export const dynamic = "force-dynamic";

async function getPnlData(teamId: string, from: Date, to: Date) {
  await connectDB();
  const teamOid = mongoose.Types.ObjectId.isValid(teamId)
    ? new mongoose.Types.ObjectId(teamId)
    : null;
  if (!teamOid) {
    return {
      summary: {
        grossRevenue: 0,
        discounts: 0,
        refunds: 0,
        chargebacks: 0,
        netRevenue: 0,
        shippingRevenue: 0,
        totalRevenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        transactionFees: 0,
        shippingCosts: 0,
        totalAdSpend: 0,
        monthlyExpenses: 0,
        otherFees: 0,
        operatingExpenses: 0,
        operatingProfit: 0,
        operatingMargin: 0,
        taxes: 0,
        netProfit: 0,
        netMargin: 0,
        orderCount: 0,
      },
      adSpendByPlatform: [],
      monthlyChart: [],
    };
  }

  const [orders, adSpendRows] = await Promise.all([
    OrderModel.find({
      teamId: teamOid,
      orderDate: { $gte: from, $lte: to },
      status: { $ne: "cancelled" },
    }).lean(),
    AdSpendDailyModel.find({
      teamId: teamOid,
      date: { $gte: from, $lte: to },
    })
      .select("platform spend currency")
      .lean(),
  ]);

  // Per-order conversion into the report base currency BEFORE any
  // summing — the rule every report follows (see
  // src/lib/report-currency.ts). The previous code summed mixed-currency
  // orders 1:1 and PnlClient then rendered the total as if it were all
  // in the base currency, so a PKR order on a team whose base is USD was
  // inflated ~277x in the P&L. The base is getReportBaseCurrency —
  // the most common store currency — the same rule the dashboard
  // client uses for its baseCurrency, so the totals arrive in the
  // currency PnlClient converts FROM.
  const base = await getReportBaseCurrency(teamId);
  const rates = await getReportRates(base, teamId);
  const n = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const converted = convertOrdersToBase(
    orders.map((o) => ({
      currency: typeof o.currency === "string" ? o.currency : undefined,
      grossRevenue: n(o.grossRevenue),
      discounts: n(o.discounts),
      shippingRevenue: n(o.shippingRevenue),
      shippingCost: n(o.shippingCost),
      totalCogs: n(o.totalCogs),
      transactionFees: n(o.transactionFees),
      taxes: n(o.taxes),
      refundAmount: n(o.refundAmount),
      chargebackAmount: n(o.chargebackAmount),
      adSpendAllocated: n(o.adSpendAllocated),
      otherCosts: n((o as { otherCosts?: unknown }).otherCosts),
    })),
    base,
    rates,
  );
  // netProfit is a derived field (not in OrderCosts): convert it per
  // order too, for the monthly chart.
  const netProfits = orders.map((o) =>
    convertAmount(
      n(o.netProfit),
      typeof o.currency === "string" ? o.currency : undefined,
      base,
      rates,
    ),
  );

  // Ad spend rows carry their own (provider) currency: convert each
  // row into the base before grouping by platform.
  const adSpendByPlatformMap = new Map<string, number>();
  for (const row of adSpendRows) {
    const spend = convertAmount(
      n(row.spend),
      typeof row.currency === "string" ? row.currency : undefined,
      base,
      rates,
    );
    const platform = typeof row.platform === "string" ? row.platform : "unknown";
    adSpendByPlatformMap.set(platform, (adSpendByPlatformMap.get(platform) ?? 0) + spend);
  }
  const adSpendByPlatform = [...adSpendByPlatformMap.entries()].map(([platform, spend]) => ({
    _id: platform,
    spend,
  }));

  // ── Income Statement ──────────────────────────────────────────────────────
  // Core money contract (profit-engine.ts): grossRevenue is already net
  // of discounts and already includes shipping charged, so discounts and
  // shippingRevenue are memos here — subtracting them again would
  // double-count. Taxes are pass-through and never reduce profit.
  // All inputs below are the per-order CONVERTED costs (base currency).
  const grossRevenue    = converted.reduce((s, o) => s + o.grossRevenue, 0);
  const discounts       = converted.reduce((s, o) => s + o.discounts, 0);
  const refunds         = converted.reduce((s, o) => s + o.refundAmount, 0);
  const chargebacks     = converted.reduce((s, o) => s + o.chargebackAmount, 0);
  const netRevenue      = grossRevenue - refunds - chargebacks;
  const shippingRevenue = converted.reduce((s, o) => s + o.shippingRevenue, 0);
  const totalRevenue    = netRevenue;

  const cogs            = converted.reduce((s, o) => s + o.totalCogs, 0);
  const grossProfit     = totalRevenue - cogs;
  const grossMargin     = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const transactionFees = converted.reduce((s, o) => s + o.transactionFees, 0);
  const shippingCosts   = converted.reduce((s, o) => s + o.shippingCost, 0);
  const totalAdSpend    = adSpendByPlatform.reduce((s, a) => s + a.spend, 0);

  // Monthly/operating expenses: the same calendar-month allocation
  // the Monthly Expenses page shows, in the same base currency.
  const { allocated: monthlyExpenses } = await getAllocatedMonthlyExpenses({
    session: { userId: "", teamId, plan: "", role: "", teamRole: null, email: "" },
    from, to, format: "json", granularity: "daily",
  } as ReportContext);

  // Other-fee rules: matched per order (country / payment method /
  // product tag + effective dates) against the base-converted order
  // values; fixed fees are converted from the rule's currency.
  const otherFeeRules = await OtherFeeRuleModel.find({ teamId: teamOid, isActive: true }).lean();
  const otherFees = computeOtherFees(
    otherFeeRules.map((r) => ({
      kind: r.kind, value: r.value, currency: r.currency,
      country: r.country, productTag: r.productTag, paymentMethod: r.paymentMethod,
      effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
    })),
    orders.map((o, i) => ({
      grossRevenue: converted[i].grossRevenue,
      shippingCountry: typeof o.shippingCountry === "string" ? o.shippingCountry : undefined,
      paymentMethod: typeof o.paymentMethod === "string" ? o.paymentMethod : undefined,
      orderDate: o.orderDate,
      status: o.status,
      lineItems: ((o.lineItems ?? []) as { tags?: string[] }[]).map((li) => ({ tags: li.tags ?? null })),
    })),
    { baseCurrency: base, rates },
  ).total;

  const operatingExpenses = transactionFees + shippingCosts + totalAdSpend + monthlyExpenses + otherFees;
  const operatingProfit   = grossProfit - operatingExpenses;
  const operatingMargin   = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;

  const taxes             = converted.reduce((s, o) => s + o.taxes, 0);
  // Taxes collected are pass-through to the government, not a cost:
  // net profit equals operating profit. Taxes are still shown as a memo.
  const netProfit         = operatingProfit;
  const netMargin         = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Monthly breakdown for chart — converted costs, same as the summary.
  const monthlyMap = new Map<string, { revenue: number; cogs: number; opex: number; netProfit: number }>();
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    const c = converted[i];
    const key = o.orderDate.toISOString().slice(0, 7);
    const cur = monthlyMap.get(key) ?? { revenue: 0, cogs: 0, opex: 0, netProfit: 0 };
    const rev = c.grossRevenue - c.refundAmount - c.chargebackAmount;
    cur.revenue  += rev;
    cur.cogs     += c.totalCogs;
    cur.opex     += c.transactionFees + c.shippingCost + c.adSpendAllocated;
    cur.netProfit += netProfits[i];
    monthlyMap.set(key, cur);
  }
  const monthlyChart = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  return {
    summary: {
      grossRevenue, discounts, refunds, chargebacks, shippingRevenue,
      netRevenue, totalRevenue, cogs, grossProfit, grossMargin,
      transactionFees, shippingCosts, totalAdSpend, monthlyExpenses, otherFees, operatingExpenses,
      operatingProfit, operatingMargin, taxes, netProfit, netMargin,
      orderCount: orders.length,
    },
    adSpendByPlatform,
    monthlyChart,
  };
}

interface Props { searchParams: Promise<{ from?: string; to?: string }> }

export default async function PnlPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const user = session.user as { teamId?: string };
  if (!user.teamId) redirect("/onboarding");

  const params = await searchParams;
  const now = new Date();
  // Garbage ?from=/?to= used to become an Invalid Date and 500 the page
  // (CastError on the orderDate query). parseDateRange falls back to the
  // default range for an unparseable end instead; a valid-but-reversed
  // range still just returns empty results.
  const { from, to } = parseDateRange(params.from, params.to, now);

  const data = await getPnlData(user.teamId, from, to);

  return (
    <PnlClient
      data={data}
      defaultFrom={from.toISOString().slice(0, 10)}
      defaultTo={to.toISOString().slice(0, 10)}
    />
  );
}
