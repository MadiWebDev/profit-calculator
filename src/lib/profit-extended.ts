/**
 * Extended profit breakdown (Phase 3) — builds on the core engine in
 * src/lib/profit-engine.ts without changing its signature or contract.
 *
 * The spec's full formula:
 *   net profit = revenue (after discounts)
 *     - refunds and returns
 *     - COGS (per variant)
 *     - shipping cost actually paid to the courier
 *     - COD / payment gateway fees (per gateway, configurable)
 *     - Shopify transaction fees and subscription share
 *     - packaging and handling cost
 *     - ad spend attributed
 *     - taxes are pass-through (see tax mode below)
 *     - returned-to-origin (RTO) loss: shipping + packaging lost
 *     - custom fixed and variable expenses, allocated per order or per day
 *
 * Tax mode:
 * - "exclusive" (default, matches the core engine): revenue is
 *   tax-exclusive; tax collected is pass-through and never touches profit.
 * - "inclusive": the charged amount includes tax. normalizeTaxInclusive()
 *   splits it into tax-exclusive revenue + tax amount first; the rest of
 *   the formula then runs unchanged. Never subtract tax twice.
 *
 * Currency: every function here takes amounts in ONE currency. Callers
 * normalize with convertCurrency() first, or pass fxRateAtOrder (stored
 * at order time) and use toBaseCurrency() for reporting totals.
 */
import {
  calcOrderProfit,
  round,
  toMoney,
  type OrderCosts,
} from "@/lib/profit-engine";

export type TaxMode = "exclusive" | "inclusive";

export interface ExtendedOrderInput extends OrderCosts {
  /** Per-order packaging + handling cost. */
  packagingCost?: number;
  /** COD fee / extra gateway fee beyond transactionFees. */
  codFee?: number;
  /** This order's share of the Shopify subscription (monthly fee / orders). */
  subscriptionShare?: number;
  /** Loss on a returned-to-origin order: shipping + packaging already lost. */
  rtoLoss?: number;
  /** Allocated share of custom fixed/variable expenses for this order. */
  expenseAllocation?: number;
  /** "inclusive" means grossRevenue includes tax; see normalizeTaxInclusive. */
  taxMode?: TaxMode;
  /** Tax rate % used only to split inclusive revenue. */
  taxRatePercent?: number;
}

export interface ProfitBreakdown {
  revenue: number;
  refunds: number;
  netRevenue: number;
  cogs: number;
  shippingCost: number;
  transactionFees: number;
  codFee: number;
  subscriptionShare: number;
  packagingCost: number;
  adSpend: number;
  rtoLoss: number;
  expenseAllocation: number;
  otherCosts: number;
  taxes: number;
  netProfit: number;
  netMargin: number;
}

/** Split a tax-inclusive charged amount into ex-tax revenue + tax. */
export function normalizeTaxInclusive(
  grossInclusive: number,
  taxRatePercent: number
): { grossRevenue: number; taxes: number } {
  const gross = toMoney(grossInclusive);
  const rate = Math.max(0, toMoney(taxRatePercent)) / 100;
  if (rate === 0) return { grossRevenue: round(gross), taxes: 0 };
  const exTax = gross / (1 + rate);
  return { grossRevenue: round(exTax), taxes: round(gross - exTax) };
}

/**
 * True net profit for one order, with the full breakdown.
 * Cancelled orders are handled by callers (dashboard metrics exclude
 * them by default); this function itself is order-agnostic so unit
 * tests can verify the arithmetic in isolation.
 */
export function calcTrueNetProfit(input: ExtendedOrderInput): ProfitBreakdown {
  let grossRevenue = toMoney(input.grossRevenue);
  let taxes = toMoney(input.taxes);
  if (input.taxMode === "inclusive") {
    const split = normalizeTaxInclusive(grossRevenue, input.taxRatePercent ?? 0);
    grossRevenue = split.grossRevenue;
    taxes = split.taxes;
  }
  const core = calcOrderProfit({
    ...input,
    grossRevenue,
    taxes,
    otherCosts:
      toMoney(input.otherCosts) +
      toMoney(input.packagingCost) +
      toMoney(input.codFee) +
      toMoney(input.subscriptionShare) +
      toMoney(input.rtoLoss) +
      toMoney(input.expenseAllocation),
  });
  const netMargin = core.netRevenue > 0 ? round((core.netProfit / core.netRevenue) * 100) : 0;
  return {
    revenue: round(grossRevenue),
    refunds: round(toMoney(input.refundAmount) + toMoney(input.chargebackAmount)),
    netRevenue: core.netRevenue,
    cogs: round(toMoney(input.totalCogs)),
    shippingCost: round(toMoney(input.shippingCost)),
    transactionFees: round(toMoney(input.transactionFees)),
    codFee: round(toMoney(input.codFee)),
    subscriptionShare: round(toMoney(input.subscriptionShare)),
    packagingCost: round(toMoney(input.packagingCost)),
    adSpend: round(toMoney(input.adSpendAllocated)),
    rtoLoss: round(toMoney(input.rtoLoss)),
    expenseAllocation: round(toMoney(input.expenseAllocation)),
    otherCosts: round(toMoney(input.otherCosts)),
    taxes: round(taxes),
    netProfit: core.netProfit,
    netMargin,
  };
}

// ─── Dashboard metrics ──────────────────────────────────────────────────────

export interface DashboardOrderInput extends ExtendedOrderInput {
  status?: string;
  isRto?: boolean;
  isReturn?: boolean;
  customerKey?: string;
  isFirstOrder?: boolean;
  /** Cash actually collected for a COD order (0 until collected). */
  codCollected?: number;
  /** Cash still pending for a COD order. */
  codPending?: number;
}

export interface DashboardMetrics {
  revenue: number;
  netProfit: number;
  netMargin: number;
  orderCount: number;
  aov: number;
  adSpend: number;
  roas: number;
  mer: number;
  breakEvenRoas: number;
  cac: number;
  newCustomers: number;
  repeatCustomers: number;
  ltv: number;
  returnRate: number;
  rtoRate: number;
  cashCollected: number;
  cashPending: number;
  totalCosts: number;
}

export function calcDashboardMetrics(
  orders: DashboardOrderInput[],
  opts: { includeCancelled?: boolean } = {}
): DashboardMetrics {
  const included = orders.filter(
    (o) => opts.includeCancelled || (o.status ?? "fulfilled") !== "cancelled"
  );
  const breakdowns = included.map((o) => calcTrueNetProfit(o));
  const sum = (f: (b: ProfitBreakdown) => number) =>
    round(breakdowns.reduce((s, b) => s + f(b), 0));
  const revenue = sum((b) => b.netRevenue);
  const netProfit = sum((b) => b.netProfit);
  const adSpend = sum((b) => b.adSpend);
  const nonAdCosts = sum((b) => b.cogs + b.shippingCost + b.transactionFees + b.codFee + b.packagingCost + b.rtoLoss + b.expenseAllocation + b.otherCosts + b.subscriptionShare);
  const orderCount = included.length;
  const customers = new Map<string, number>();
  for (const o of included) {
    if (!o.customerKey) continue;
    customers.set(o.customerKey, (customers.get(o.customerKey) ?? 0) + 1);
  }
  const newCustomers = included.filter((o) => o.isFirstOrder).length;
  const repeatCustomers = [...customers.values()].filter((n) => n > 1).length;
  const ltv = customers.size > 0 ? round(netProfit / customers.size) : 0;
  const returns = included.filter((o) => o.isReturn || (o.refundAmount ?? 0) > 0).length;
  const rtos = included.filter((o) => o.isRto || (o.rtoLoss ?? 0) > 0).length;
  return {
    revenue,
    netProfit,
    netMargin: revenue > 0 ? round((netProfit / revenue) * 100) : 0,
    orderCount,
    aov: orderCount > 0 ? round(revenue / orderCount) : 0,
    adSpend,
    roas: adSpend > 0 ? round(revenue / adSpend, 2) : 0,
    // MER = total revenue / total ad spend across all channels; with a
    // single attributed spend pool it equals ROAS by construction, but
    // it is reported separately because the two diverge once spend is
    // split per channel (see the per-campaign API in Phase 5).
    mer: adSpend > 0 ? round(revenue / adSpend, 2) : 0,
    breakEvenRoas: adSpend > 0 ? round((adSpend + nonAdCosts) / adSpend, 2) : 0,
    cac: newCustomers > 0 ? round(adSpend / newCustomers) : 0,
    newCustomers,
    repeatCustomers,
    ltv,
    returnRate: orderCount > 0 ? round((returns / orderCount) * 100) : 0,
    rtoRate: orderCount > 0 ? round((rtos / orderCount) * 100) : 0,
    cashCollected: round(included.reduce((s, o) => s + toMoney(o.codCollected), 0)),
    cashPending: round(included.reduce((s, o) => s + toMoney(o.codPending), 0)),
    totalCosts: round(revenue - netProfit),
  };
}

/** % change vs a previous period (0 when the previous value is 0 and unchanged, Infinity-safe). */
export function periodDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round(((current - previous) / Math.abs(previous)) * 100);
}

export function comparePeriods(
  current: DashboardMetrics,
  previous: DashboardMetrics
): Record<"revenue" | "netProfit" | "aov" | "orderCount", number> {
  return {
    revenue: periodDelta(current.revenue, previous.revenue),
    netProfit: periodDelta(current.netProfit, previous.netProfit),
    aov: periodDelta(current.aov, previous.aov),
    orderCount: periodDelta(current.orderCount, previous.orderCount),
  };
}

// ─── Expense allocation ─────────────────────────────────────────────────────

export function allocatePerOrder(totalExpense: number, orderCount: number): number {
  if (orderCount <= 0) return 0;
  return round(toMoney(totalExpense) / orderCount);
}

export function allocatePerDay(totalExpense: number, days: number): number {
  if (days <= 0) return 0;
  return round(toMoney(totalExpense) / days);
}

/** COD cash split: collected vs still pending. */
export function codSplit(total: number, collected: number): { collected: number; pending: number } {
  const t = toMoney(total);
  const c = Math.min(Math.max(0, toMoney(collected)), t);
  return { collected: round(c), pending: round(t - c) };
}

// ─── Stock risk / reorder ───────────────────────────────────────────────────

export interface StockInput {
  onHand: number;
  soldLast30Days: number;
  leadTimeDays?: number;
  safetyDays?: number;
}

export interface ReorderSuggestion {
  dailyRate: number;
  daysOfStock: number;
  reorderPoint: number;
  suggestedQty: number;
  risk: "ok" | "low" | "critical";
}

export function reorderSuggestion(input: StockInput): ReorderSuggestion {
  const onHand = Math.max(0, toMoney(input.onHand));
  const dailyRate = round(toMoney(input.soldLast30Days) / 30, 4);
  const daysOfStock = dailyRate > 0 ? round(onHand / dailyRate, 1) : Infinity;
  const lead = Math.max(0, toMoney(input.leadTimeDays ?? 7));
  const safety = Math.max(0, toMoney(input.safetyDays ?? 7));
  const reorderPoint = Math.ceil(dailyRate * (lead + safety));
  const suggestedQty = Math.max(0, reorderPoint * 2 - onHand);
  const risk =
    onHand === 0 || daysOfStock <= lead
      ? "critical"
      : daysOfStock <= lead + safety
        ? "low"
        : "ok";
  return {
    dailyRate,
    daysOfStock: daysOfStock === Infinity ? -1 : daysOfStock,
    reorderPoint,
    suggestedQty,
    risk,
  };
}

// ─── FX at order time ───────────────────────────────────────────────────────

/** Convert with a rate stored at order time (not today's spot rate). */
export function toBaseCurrency(amount: number, fxRateAtOrder: number): number {
  const rate = toMoney(fxRateAtOrder);
  if (rate <= 0) return round(amount);
  return round(toMoney(amount) * rate);
}
