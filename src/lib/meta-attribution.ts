/**
 * Meta ads hardening helpers — pure functions only.
 *
 * No network, no database, no credentials. These helpers cover the
 * parts of Meta spend sync that are easy to get wrong:
 *
 * 1. Delayed-reporting corrections: Meta numbers settle over a few days,
 *    so the sync re-pulls the last N days on every run (repullWindow).
 * 2. Currency: ad accounts often bill in a different currency than the
 *    store, so spend is converted with the shared profit-engine helper
 *    (convertAdSpend) before any comparison with store revenue.
 * 3. Attribution: Meta-reported ROAS is not profit. Spend is attributed
 *    to orders ONLY on a UTM match (see attributeSpendToCampaigns) and
 *    unattributed spend is reported separately — never silently spread
 *    across campaigns, which would flatter or punish the wrong ones.
 * 4. Alerts: spend/profit drift, break-even breaches, spikes, and
 *    tracking breaks are detected from the attributed numbers.
 *
 * TIMEZONE NOTE: repullWindow() returns UTC day boundaries. Meta
 * reporting is in the ad account's timezone, so callers MUST convert
 * these boundaries into the ad account timezone before querying the
 * Meta API (e.g. shift the window so "today" means the account's
 * today, not UTC's). The window itself is timezone-safe: it always
 * covers whole calendar days, never a partial day sliced by a UTC
 * offset.
 */

import { convertCurrency } from "@/lib/profit-engine";

/** Non-finite numbers (NaN/Infinity from bad input) are treated as 0. */
function num(n: number | undefined | null): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Repull window ──────────────────────────────────────────────────────────

export interface RepullWindow {
  /** Start of the first day in the window, 00:00:00.000 UTC. */
  start: Date;
  /** End of the last day in the window, 23:59:59.999 UTC. */
  end: Date;
}

/**
 * Window covering the last `days` calendar days inclusive of `today`.
 * Default days = 3 (re-pull the last 3 days daily to pick up Meta's
 * delayed-reporting corrections). `today` is read in UTC so the result
 * does not depend on the server's local timezone.
 *
 * Example: today = 2026-10-25, days = 3 →
 *   start = 2026-10-23T00:00:00.000Z, end = 2026-10-25T23:59:59.999Z.
 */
export function repullWindow(today: Date, days = 3): RepullWindow {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("repullWindow: days must be a positive integer");
  }
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const date = today.getUTCDate();
  const start = new Date(Date.UTC(year, month, date - (days - 1), 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));
  return { start, end };
}

// ─── Currency conversion ────────────────────────────────────────────────────

/**
 * Convert an ad-spend amount between currencies using the shared
 * profit-engine rates table (units of currency per 1 USD). Same-currency
 * conversion is exact (no rounding drift); unknown currencies throw
 * via convertCurrency rather than silently returning unconverted spend.
 * Callers should normalise all spend rows to the store currency with
 * this helper BEFORE calling attributeSpendToCampaigns().
 */
export function convertAdSpend(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  return convertCurrency(amount, fromCurrency, toCurrency, rates);
}

// ─── Attribution ────────────────────────────────────────────────────────────

export interface SpendRow {
  campaignId: string;
  adsetId?: string;
  adId?: string;
  spend: number;
  currency: string;
}

export interface AttributableOrder {
  orderId: string;
  utmCampaign?: string;
  utmSource?: string;
  revenue: number;
  cogs: number;
  fees: number;
}

export interface CampaignAttribution {
  campaignId: string;
  spend: number;
  attributedRevenue: number;
  attributedOrders: number;
  attributedCogs: number;
  attributedFees: number;
  /** revenue - cogs - fees - spend. */
  profit: number;
  /** attributedRevenue / spend, or 0 when spend is 0 (never NaN/Inf). */
  roas: number;
  /**
   * (spend + cogs + fees) / spend — the ROAS at which the campaign
   * breaks even — or 0 when spend is 0.
   */
  breakEvenRoas: number;
}

export interface AttributionResult {
  campaigns: CampaignAttribution[];
  /**
   * Spend belonging to campaigns with zero attributed orders — i.e.
   * spend no order UTM-matched. Reported separately, never assigned
   * to other campaigns.
   */
  unattributedSpend: number;
  unattributedCampaignIds: string[];
}

/** Sources that count as Meta traffic for attribution. */
const META_SOURCES = new Set(["meta", "facebook", "instagram"]);

/**
 * Attribute spend to orders on UTM match ONLY:
 * - order.utmSource (lowercased/trimmed) must be meta, facebook, or
 *   instagram — any other source (google, tiktok, direct, missing)
 *   is ignored, even if utmCampaign happens to match.
 * - order.utmCampaign must match a spend row's campaignId
 *   case-insensitively (UTM values are free text; "Summer_Sale" and
 *   "summer_sale" are the same campaign).
 * - Campaign ids are grouped case-insensitively; the first-seen
 *   spelling is kept in the output.
 * - Orders whose utmCampaign matches no spend campaign are ignored
 *   (there is no spend to attribute them against).
 * - Spend rows are assumed already normalised to one currency
 *   (see convertAdSpend); this function sums them as given.
 */
export function attributeSpendToCampaigns(
  spendRows: SpendRow[],
  orders: AttributableOrder[]
): AttributionResult {
  interface Acc {
    displayId: string;
    spend: number;
    revenue: number;
    cogs: number;
    fees: number;
    orderCount: number;
  }
  const byKey = new Map<string, Acc>();

  for (const row of spendRows) {
    const key = row.campaignId.toLowerCase();
    const acc = byKey.get(key) ?? {
      displayId: row.campaignId,
      spend: 0,
      revenue: 0,
      cogs: 0,
      fees: 0,
      orderCount: 0,
    };
    acc.spend += num(row.spend);
    byKey.set(key, acc);
  }

  for (const order of orders) {
    const source = (order.utmSource ?? "").trim().toLowerCase();
    if (!META_SOURCES.has(source)) continue;
    if (!order.utmCampaign) continue;
    const acc = byKey.get(order.utmCampaign.trim().toLowerCase());
    if (!acc) continue;
    acc.revenue += num(order.revenue);
    acc.cogs += num(order.cogs);
    acc.fees += num(order.fees);
    acc.orderCount += 1;
  }

  const campaigns: CampaignAttribution[] = [];
  let unattributedSpend = 0;
  const unattributedCampaignIds: string[] = [];

  for (const acc of byKey.values()) {
    const spend = acc.spend;
    const profit = acc.revenue - acc.cogs - acc.fees - spend;
    const roas = spend > 0 ? acc.revenue / spend : 0;
    const breakEvenRoas = spend > 0 ? (spend + acc.cogs + acc.fees) / spend : 0;
    campaigns.push({
      campaignId: acc.displayId,
      spend: round2(spend),
      attributedRevenue: round2(acc.revenue),
      attributedOrders: acc.orderCount,
      attributedCogs: round2(acc.cogs),
      attributedFees: round2(acc.fees),
      profit: round2(profit),
      roas: round2(roas),
      breakEvenRoas: round2(breakEvenRoas),
    });
    if (acc.orderCount === 0) {
      unattributedSpend += spend;
      unattributedCampaignIds.push(acc.displayId);
    }
  }

  return {
    campaigns,
    unattributedSpend: round2(unattributedSpend),
    unattributedCampaignIds,
  };
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

export type SpendAlertType =
  | "spend_up_profit_down"
  | "below_break_even"
  | "spend_spike"
  | "tracking_break";

export type SpendAlertSeverity = "warning" | "critical";

export interface SpendAlert {
  type: SpendAlertType;
  campaignId: string;
  message: string;
  severity: SpendAlertSeverity;
}

/** Previous-period figures to compare against (same shape as attribution output). */
export interface PrevCampaignPeriod {
  campaignId: string;
  spend: number;
  profit: number;
  attributedOrders: number;
}

/**
 * Detect spend alerts from attributed campaign figures.
 *
 * - spend_up_profit_down: spend rose vs previous period while profit
 *   fell — spend leaking, not earning.
 * - below_break_even: roas < breakEvenRoas with spend > 0 — the
 *   campaign loses money on every attributed order. (No previous
 *   period needed.)
 * - spend_spike: spend > 50% above previous period AND the absolute
 *   increase exceeds $50 (in the currency of the figures), so trivial
 *   small-spend wiggles don't alert. When previous spend was 0, any
 *   spend above $50 counts as a spike.
 * - tracking_break: spend > 0 but attributedOrders == 0 while the
 *   previous period had attributed orders — spend is flowing but
 *   attribution has stopped, so the numbers can't be trusted.
 *
 * Campaigns are matched to the previous period case-insensitively.
 * A campaign with no previous-period entry gets only the
 * below_break_even check (prev-comparison alerts need a baseline).
 */
export function detectSpendAlerts(
  campaigns: CampaignAttribution[],
  prevPeriod: PrevCampaignPeriod[]
): SpendAlert[] {
  const prevByKey = new Map<string, PrevCampaignPeriod>();
  for (const prev of prevPeriod) {
    prevByKey.set(prev.campaignId.toLowerCase(), prev);
  }

  const alerts: SpendAlert[] = [];
  for (const c of campaigns) {
    const spend = num(c.spend);
    const profit = num(c.profit);
    const roas = num(c.roas);
    const breakEven = num(c.breakEvenRoas);

    if (spend > 0 && roas < breakEven) {
      alerts.push({
        type: "below_break_even",
        campaignId: c.campaignId,
        message:
          `Campaign ${c.campaignId} is below break-even: ROAS ${roas.toFixed(2)} ` +
          `is under break-even ROAS ${breakEven.toFixed(2)} on spend ${spend.toFixed(2)}.`,
        severity: "warning",
      });
    }

    const prev = prevByKey.get(c.campaignId.toLowerCase());
    if (!prev) continue;
    const prevSpend = num(prev.spend);
    const prevProfit = num(prev.profit);
    const prevOrders = num(prev.attributedOrders);

    if (spend > prevSpend && profit < prevProfit) {
      alerts.push({
        type: "spend_up_profit_down",
        campaignId: c.campaignId,
        message:
          `Campaign ${c.campaignId}: spend rose from ${prevSpend.toFixed(2)} to ${spend.toFixed(2)} ` +
          `while profit fell from ${prevProfit.toFixed(2)} to ${profit.toFixed(2)}.`,
        severity: "warning",
      });
    }

    const increase = spend - prevSpend;
    const spike =
      increase > 50 &&
      (prevSpend === 0 ? spend > 50 : spend > prevSpend * 1.5);
    if (spike) {
      alerts.push({
        type: "spend_spike",
        campaignId: c.campaignId,
        message:
          `Campaign ${c.campaignId}: spend spiked from ${prevSpend.toFixed(2)} to ${spend.toFixed(2)} ` +
          `(increase ${increase.toFixed(2)}, over 50% and over 50 absolute).`,
        severity: "warning",
      });
    }

    if (spend > 0 && num(c.attributedOrders) === 0 && prevOrders > 0) {
      alerts.push({
        type: "tracking_break",
        campaignId: c.campaignId,
        message:
          `Campaign ${c.campaignId}: spend is ${spend.toFixed(2)} but no orders were attributed, ` +
          `while the previous period attributed ${prevOrders} order(s). Check UTM tracking.`,
        severity: "critical",
      });
    }
  }
  return alerts;
}
