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

import { convertOrderCosts, type OrderCosts } from "@/lib/profit-engine";

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
