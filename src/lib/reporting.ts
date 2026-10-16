/**
 * Reporting currency normalization.
 *
 * The profit engine works in ONE currency per call — summing raw order
 * amounts across currencies silently produces wrong totals. These helpers
 * normalize every order's costs into the team's base currency (via
 * convertOrderCosts + live FX rates) before aggregation.
 *
 * Degradation policy (reports must stay available):
 * - Single-currency teams: no FX fetch at all (fast path, exact).
 * - FX provider down: log a warning, aggregate unconverted (old behavior).
 * - Unknown currency code on one order: leave that order unconverted, count
 *   it in `unconverted`, keep going.
 *
 * Note: conversion uses current spot rates, not historical rates at order
 * time — an approximation, but strictly better than summing mixed
 * currencies 1:1.
 */
import TeamModel from "@/models/Team";
import {
  calcPeriodSummary,
  convertOrderCosts,
  type OrderCosts,
  type PeriodSummary,
} from "@/lib/profit-engine";
import { getFxRates } from "@/lib/fx";
import { logger } from "@/lib/logger";

export interface NormalizableOrder {
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

export interface NormalizedReport {
  summary: PeriodSummary;
  /** Team base currency the totals are expressed in. */
  baseCurrency: string;
  /** Orders left unconverted (FX down or unknown code). */
  unconverted: number;
  /** Per-order normalized costs, aligned with the input order. */
  normalized: OrderCosts[];
}

function toCosts(o: NormalizableOrder): OrderCosts {
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

/** Team's reporting currency (defaults to USD). */
export async function getTeamBaseCurrency(teamId: string): Promise<string> {
  try {
    const team = await TeamModel.findById(teamId).select("currency").lean();
    const code = typeof team?.currency === "string" ? team.currency.toUpperCase().trim() : "";
    return /^[A-Z]{3}$/.test(code) ? code : "USD";
  } catch {
    return "USD";
  }
}

export async function normalizeReportOrders(
  orders: NormalizableOrder[],
  teamId: string
): Promise<NormalizedReport> {
  const baseCurrency = await getTeamBaseCurrency(teamId);
  const items = orders.map((o) => ({
    currency: (o.currency ?? "USD").toUpperCase().trim() || "USD",
    costs: toCosts(o),
  }));

  // Fast path: everything already in the base currency — exact, no FX needed.
  if (items.every((i) => i.currency === baseCurrency)) {
    const normalized = items.map((i) => i.costs);
    return { summary: calcPeriodSummary(normalized), baseCurrency, unconverted: 0, normalized };
  }

  let rates: Record<string, number>;
  try {
    rates = (await getFxRates()).rates;
  } catch {
    logger.warn("reporting: FX rates unavailable — aggregating mixed currencies unconverted", {
      teamId,
      baseCurrency,
    });
    const normalized = items.map((i) => i.costs);
    return {
      summary: calcPeriodSummary(normalized),
      baseCurrency,
      unconverted: items.length,
      normalized,
    };
  }

  let unconverted = 0;
  const normalized = items.map(({ currency, costs }) => {
    if (currency === baseCurrency) return costs;
    try {
      return convertOrderCosts(costs, currency, baseCurrency, rates);
    } catch {
      unconverted++;
      logger.warn("reporting: unknown currency code — order left unconverted", {
        currency,
        baseCurrency,
      });
      return costs;
    }
  });

  return { summary: calcPeriodSummary(normalized), baseCurrency, unconverted, normalized };
}
