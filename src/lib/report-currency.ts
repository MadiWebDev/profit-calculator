/**
 * Per-order currency conversion for report aggregation.
 *
 * The rule every report must follow: convert EACH order into the report's
 * base currency BEFORE summing. Summing first and converting the total
 * (or worse, summing mixed currencies 1:1 and labelling the result with
 * one currency) is wrong whenever a team has orders in more than one
 * currency — which is every multi-store team and every Shopify Markets
 * store. An order's currency is the currency Shopify stored on that
 * order (its presentment currency, falling back to the store's shop
 * currency at sync time); it is never the viewer's display currency
 * and never assumed to be USD.
 *
 * When rates are unavailable, conversion is skipped and the order's
 * amounts pass through unchanged (the previous behaviour) rather than
 * failing the whole report — callers log that case themselves.
 */

import { convertCurrency, convertOrderCosts, type OrderCosts } from "@/lib/profit-engine";
import { getFxRates, type FxOverrideInput } from "@/lib/fx";
import StoreModel from "@/models/Store";
import TeamModel from "@/models/Team";
import WorkspaceSettingsModel from "@/models/WorkspaceSettings";

export interface OrderMoney {
  currency?: string | null;
  grossRevenue: number;
  discounts: number;
  shippingRevenue: number;
  shippingCost: number;
  totalCogs: number;
  transactionFees: number;
  taxes: number;
  refundAmount: number;
  chargebackAmount: number;
  adSpendAllocated: number;
  otherCosts?: number;
}

function toCosts(o: OrderMoney): OrderCosts {
  return {
    grossRevenue: o.grossRevenue,
    discounts: o.discounts,
    shippingRevenue: o.shippingRevenue,
    shippingCost: o.shippingCost,
    totalCogs: o.totalCogs,
    transactionFees: o.transactionFees,
    taxes: o.taxes,
    refundAmount: o.refundAmount,
    chargebackAmount: o.chargebackAmount,
    adSpendAllocated: o.adSpendAllocated,
    otherCosts: o.otherCosts,
  };
}

/**
 * Convert a list of orders' money fields into `baseCurrency`.
 * `rates` is a USD-based (or base-based) rates table as returned by
 * getFxRates(baseCurrency); when null, orders pass through unconverted.
 * Same-currency orders are exact (convertOrderCosts returns them rounded).
 */
export function convertOrdersToBase(
  orders: OrderMoney[],
  baseCurrency: string,
  rates: Record<string, number> | null,
): OrderCosts[] {
  const base = baseCurrency.toUpperCase().trim();
  return orders.map((o) => {
    const costs = toCosts(o);
    const from = (o.currency ?? base).toUpperCase().trim();
    if (!rates || from === base) return costs;
    try {
      return convertOrderCosts(costs, from, base, rates);
    } catch {
      // Unknown currency in the rates table — keep the order unconverted
      // rather than dropping it from the report.
      return costs;
    }
  });
}

/**
 * Convert one amount into `base`, falling back to the original amount
 * when rates are unavailable or the currency is unknown — same
 * fail-open rule as convertOrdersToBase, so a report never drops an
 * order over a missing rate.
 */
export function convertAmount(
  amount: number,
  from: string | null | undefined,
  base: string,
  rates: Record<string, number> | null,
): number {
  const b = base.toUpperCase().trim();
  const f = (from ?? b).toUpperCase().trim();
  if (!rates || f === b) return amount;
  try {
    return convertCurrency(amount, f, b, rates);
  } catch {
    return amount;
  }
}

/**
 * The base currency for a report.
 *
 * Precedence:
 * 1. A reporting currency the team EXPLICITLY set on the Currency
 *    page (WorkspaceSettings.reportingCurrency with
 *    reportingCurrencyExplicit) — it governs aggregation. Only an
 *    explicit save counts: WorkspaceSettings docs created by other
 *    settings pages carry a stamped default, not a choice, and must
 *    never override the store currency (see the model).
 * 2. The single store's currency when a store is selected, otherwise
 *    the team's most common store currency (same rule the dashboard
 *    uses), falling back to the team's own configured currency
 *    (Team.currency) when no store has one — and to USD only when
 *    the team has no valid currency either (its model default).
 * Callers must already be connected to the database (every report
 * caller is).
 */
export async function getReportBaseCurrency(
  teamId: string | object,
  storeId?: string | object | null,
): Promise<string> {
  const explicit = await getExplicitReportingCurrency(teamId);
  if (explicit) return explicit;
  if (storeId) {
    const store = await StoreModel.findOne({ _id: storeId }).select("currency").lean();
    if (store?.currency) return String(store.currency).toUpperCase();
  }
  const stores = await StoreModel.find({ teamId }).select("currency").lean();
  const counts = new Map<string, number>();
  for (const s of stores) {
    const c = String(s.currency ?? "").toUpperCase().trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = "USD";
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  if (bestCount === 0) {
    // No store carries a currency: the team's own configured currency
    // is the honest base — a team that set PKR reports in PKR even
    // before its first store syncs — instead of a hardcoded USD.
    const team = await TeamModel.findById(teamId).select("currency").lean();
    const code = typeof team?.currency === "string" ? team.currency.toUpperCase().trim() : "";
    if (/^[A-Z]{3}$/.test(code)) return code;
  }
  return best;
}

/** Fetch the rates table for a base currency, or null when unavailable.
 *  When `teamId` is given, the team's saved manual FX overrides are
 *  applied on top of the fetched rates (overrides win). */
export async function getReportRates(
  base: string,
  teamId?: string | object | null,
): Promise<Record<string, number> | null> {
  try {
    const overrides = teamId ? await getTeamFxOverrides(teamId) : undefined;
    const fx = await getFxRates(base, overrides);
    return fx.rates;
  } catch {
    return null;
  }
}

/**
 * The team's explicitly chosen reporting currency, or null when the
 * team never set one on the Currency page. Only
 * `reportingCurrencyExplicit` counts — a WorkspaceSettings doc
 * created by another settings page carries a stamped default, not a
 * choice. Never throws: on any failure the caller falls through to
 * the store-currency rule.
 */
export async function getExplicitReportingCurrency(
  teamId: string | object,
): Promise<string | null> {
  try {
    const doc = await WorkspaceSettingsModel.findOne({ teamId })
      .select("reportingCurrency reportingCurrencyExplicit")
      .lean();
    if (!doc || (doc as { reportingCurrencyExplicit?: boolean }).reportingCurrencyExplicit !== true) {
      return null;
    }
    const code = typeof (doc as { reportingCurrency?: unknown }).reportingCurrency === "string"
      ? String((doc as { reportingCurrency: string }).reportingCurrency).toUpperCase().trim()
      : "";
    return /^[A-Z]{3}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** The team's saved manual FX overrides (effective-dated), or [] when
 *  none are saved. Never throws — callers fall back to fetched rates. */
export async function getTeamFxOverrides(
  teamId: string | object,
): Promise<FxOverrideInput[]> {
  try {
    const doc = await WorkspaceSettingsModel.findOne({ teamId })
      .select("fxOverrides")
      .lean();
    const list = (doc as { fxOverrides?: unknown } | null)?.fxOverrides;
    if (!Array.isArray(list)) return [];
    return list
      .map((o) => {
        const r = o as { currency?: unknown; rate?: unknown; effectiveFrom?: unknown };
        return {
          currency: typeof r.currency === "string" ? r.currency : "",
          rate: typeof r.rate === "number" ? r.rate : Number(r.rate),
          effectiveFrom: r.effectiveFrom as Date | string,
        };
      })
      .filter((o) => /^[A-Za-z]{3}$/.test(o.currency) && Number.isFinite(o.rate) && o.rate > 0);
  } catch {
    return [];
  }
}

/** Sum a list of converted OrderCosts field by field. */
export function sumCosts(orders: OrderCosts[]): OrderCosts {
  const zero: OrderCosts = {
    grossRevenue: 0,
    discounts: 0,
    shippingRevenue: 0,
    shippingCost: 0,
    totalCogs: 0,
    transactionFees: 0,
    taxes: 0,
    refundAmount: 0,
    chargebackAmount: 0,
    adSpendAllocated: 0,
    otherCosts: 0,
  };
  for (const o of orders) {
    zero.grossRevenue += o.grossRevenue;
    zero.discounts += o.discounts;
    zero.shippingRevenue += o.shippingRevenue;
    zero.shippingCost += o.shippingCost;
    zero.totalCogs += o.totalCogs;
    zero.transactionFees += o.transactionFees;
    zero.taxes += o.taxes;
    zero.refundAmount += o.refundAmount;
    zero.chargebackAmount += o.chargebackAmount;
    zero.adSpendAllocated += o.adSpendAllocated;
    zero.otherCosts = (zero.otherCosts ?? 0) + (o.otherCosts ?? 0);
  }
  return zero;
}
