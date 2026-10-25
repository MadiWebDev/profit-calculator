/**
 * GET /api/analytics/meta-attribution — Phase 5 true per-campaign profit.
 *
 * Query: from, to (ISO dates, default last 30 days), adAccountId (optional).
 *
 * Meta-reported ROAS is not profit. This endpoint attributes spend to
 * orders ONLY on a UTM match (order.source must be meta/facebook/
 * instagram AND order.utmCampaign must match a spend campaign id,
 * case-insensitive — see meta-attribution.ts) and computes per-campaign
 * profit = attributed revenue − COGS − fees − spend, plus break-even
 * ROAS. Spend is converted from the ad account currency to the store
 * currency with live FX rates; if conversion fails and currencies
 * differ, the endpoint returns 503 instead of silently reporting
 * unconverted spend. Spend with no attributed orders is reported
 * separately as unattributedSpend, never spread across campaigns.
 * Alerts compare against the previous period of the same length.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import AdAccountModel from "@/models/AdAccount";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import {
  attributeSpendToCampaigns,
  detectSpendAlerts,
  convertAdSpend,
  type SpendRow,
  type AttributableOrder,
  type PrevCampaignPeriod,
} from "@/lib/meta-attribution";
import { getFxRates } from "@/lib/fx";

const QuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    adAccountId: z.string().optional(),
  })
  .strict();

async function buildAttribution(
  teamId: string,
  from: Date,
  to: Date,
  adAccountId: string | undefined,
  rates: Record<string, number>,
  storeCurrency: string
) {
  await connectDB();
  const teamOid = toObjectId(teamId);
  const accountFilter: Record<string, unknown> = { teamId: teamOid, platform: "meta", isActive: true };
  if (adAccountId) accountFilter._id = toObjectId(adAccountId);
  const accounts = await AdAccountModel.find(accountFilter).select("_id currency").lean();
  const accountIds = accounts.map((a) => a._id);
  const currencyByAccount = new Map(accounts.map((a) => [a._id.toString(), a.currency ?? "USD"]));

  const spendDocs = await AdSpendDailyModel.find({
    teamId: teamOid,
    platform: "meta",
    ...(accountIds.length ? { adAccountId: { $in: accountIds } } : {}),
    date: { $gte: from, $lte: to },
  })
    .select("adAccountId campaignId spend currency")
    .lean();
  const spendRows: SpendRow[] = spendDocs.map((d) => ({
    campaignId: d.campaignId ?? "",
    spend: convertAdSpend(
      d.spend ?? 0,
      d.currency ?? currencyByAccount.get(d.adAccountId.toString()) ?? "USD",
      storeCurrency,
      rates
    ),
    currency: storeCurrency,
  }));

  const orders = await OrderModel.find({
    teamId: teamOid,
    orderDate: { $gte: from, $lte: to },
    status: { $ne: "cancelled" },
  })
    .select("source utmCampaign grossRevenue totalCogs transactionFees shippingCost")
    .lean();
  const attributable: AttributableOrder[] = orders.map((o) => ({
    orderId: o._id.toString(),
    utmCampaign: o.utmCampaign,
    utmSource: o.source,
    revenue: o.grossRevenue ?? 0,
    cogs: o.totalCogs ?? 0,
    fees: (o.transactionFees ?? 0) + (o.shippingCost ?? 0),
  }));
  return attributeSpendToCampaigns(spendRows, attributable);
}

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "meta-attribution");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;

  const now = new Date();
  const to = parsed.data.to ? new Date(parsed.data.to) : now;
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(now.getTime() - 30 * 864e5);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid date range", code: "BAD_REQUEST" }, { status: 400 });
  }

  await connectDB();
  const store = await StoreModel.findOne({ teamId: toObjectId(session.teamId) })
    .select("currency")
    .lean();
  const storeCurrency = store?.currency ?? "USD";

  let rates: Record<string, number> = {};
  try {
    rates = (await getFxRates("USD")) as unknown as Record<string, number>;
  } catch {
    rates = {};
  }
  // Same-currency conversion needs no rates; differing currencies do.
  const needsFx = (await AdAccountModel.findOne({
    teamId: toObjectId(session.teamId),
    platform: "meta",
    currency: { $ne: storeCurrency },
  }).lean()) !== null;
  if (needsFx && Object.keys(rates).length === 0) {
    return NextResponse.json(
      { error: "FX rates unavailable; cannot convert ad spend to store currency", code: "FX_UNAVAILABLE" },
      { status: 503 }
    );
  }

  const current = await buildAttribution(session.teamId, from, to, parsed.data.adAccountId, rates, storeCurrency);
  const periodMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - periodMs);
  const prev = await buildAttribution(session.teamId, prevFrom, prevTo, parsed.data.adAccountId, rates, storeCurrency);
  const prevPeriod: PrevCampaignPeriod[] = prev.campaigns.map((c) => ({
    campaignId: c.campaignId,
    spend: c.spend,
    profit: c.profit,
    attributedOrders: c.attributedOrders,
  }));
  const alerts = detectSpendAlerts(current.campaigns, prevPeriod);

  return NextResponse.json({
    currency: storeCurrency,
    period: { from: from.toISOString(), to: to.toISOString() },
    campaigns: current.campaigns,
    unattributedSpend: current.unattributedSpend,
    unattributedCampaignIds: current.unattributedCampaignIds,
    alerts,
  });
}
