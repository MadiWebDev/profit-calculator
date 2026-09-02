/**
 * CalcProfit Core Profit Engine
 * Pure functions — no side effects, no DB calls, fully testable.
 * All monetary values in the store's base currency (no conversion here).
 */

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface OrderCosts {
  grossRevenue: number;
  discounts: number;
  shippingRevenue: number;   // what customer paid for shipping
  shippingCost: number;      // what merchant paid to ship
  totalCogs: number;         // sum of line-item COGS
  transactionFees: number;   // platform + payment gateway fees
  taxes: number;             // taxes collected (pass-through, not a cost)
  refundAmount: number;
  chargebackAmount: number;
  adSpendAllocated: number;  // ad spend attributed to this order
  otherCosts?: number;
}

export interface LineItemInput {
  price: number;
  cogs: number;
  quantity: number;
  sku?: string;
  name?: string;
}

export interface SimulatorInput {
  sellingPrice: number;
  cogs: number;
  shippingCost: number;
  transactionFeePercent: number;  // e.g. 2.9
  transactionFeeFixed: number;    // e.g. 0.30
  platformFeePercent: number;
  adSpendPerUnit: number;
  quantity: number;
  refundRatePercent: number;
  taxRatePercent?: number;
}

export interface AdSpendInput {
  totalSpend: number;
  totalRevenue: number;
  totalCogs: number;
  totalFees: number;
  conversions: number;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface OrderProfit {
  netRevenue: number;
  grossProfit: number;
  grossMargin: number;       // %
  netProfit: number;
  netMargin: number;         // %
  totalCosts: number;
}

export interface SimulatorResult {
  profitPerUnit: number;
  profitMargin: number;      // %
  roi: number;               // %
  totalRevenue: number;
  totalProfit: number;
  breakEvenUnits: number;
  breakEvenPrice: number;
  totalFees: number;
  effectiveCostPerUnit: number;
}

export interface AdMetrics {
  roas: number;
  netProfit: number;
  netMargin: number;         // %
  cpa: number;
  breakEvenRoas: number;
  roi: number;               // %
}

export interface PeriodSummary {
  totalRevenue: number;
  totalCogs: number;
  totalShippingCost: number;
  totalFees: number;
  totalAdSpend: number;
  totalRefunds: number;
  totalChargebacks: number;
  totalOtherCosts: number;
  grossProfit: number;
  grossMargin: number;       // %
  netProfit: number;
  netMargin: number;         // %
  orderCount: number;
  avgOrderValue: number;
  avgNetProfit: number;
}

export interface ProductSummary {
  productId: string;
  name: string;
  sku?: string;
  totalRevenue: number;
  totalCogs: number;
  totalProfit: number;
  totalOrders: number;
  avgProfitMargin: number;   // %
  avgSellingPrice: number;
}

// ─── Core Calculations ────────────────────────────────────────────────────────

/**
 * Calculate net profit for a single order.
 * Formula: Net Profit = Net Revenue − COGS − Shipping Cost − Fees − Refunds − Chargebacks − Ad Spend
 * Taxes are collected on behalf of the government and excluded from profit.
 */
export function calcOrderProfit(costs: OrderCosts): OrderProfit {
  const netRevenue =
    costs.grossRevenue -
    costs.discounts -
    costs.refundAmount -
    costs.chargebackAmount;

  const grossProfit = netRevenue - costs.totalCogs;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  const totalCosts =
    costs.totalCogs +
    costs.shippingCost +
    costs.transactionFees +
    costs.adSpendAllocated +
    (costs.otherCosts ?? 0);

  const netProfit = netRevenue - totalCosts;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  return {
    netRevenue: round(netRevenue),
    grossProfit: round(grossProfit),
    grossMargin: round(grossMargin),
    netProfit: round(netProfit),
    netMargin: round(netMargin),
    totalCosts: round(totalCosts),
  };
}

/**
 * Calculate total COGS for a list of line items.
 */
export function calcLineItemsCogs(items: LineItemInput[]): number {
  return round(
    items.reduce((sum, item) => sum + item.cogs * item.quantity, 0)
  );
}

/**
 * Calculate transaction fees for an order.
 * Combines platform fee % + payment gateway % + fixed per-transaction fee.
 */
export function calcTransactionFees(
  orderValue: number,
  platformFeePercent: number,
  gatewayFeePercent: number,
  gatewayFixedFee: number
): number {
  const pct = ((platformFeePercent + gatewayFeePercent) / 100) * orderValue;
  return round(pct + gatewayFixedFee);
}

/**
 * Aggregate a set of orders into a period-level summary.
 */
export function calcPeriodSummary(orders: OrderCosts[]): PeriodSummary {
  const totals = orders.reduce(
    (acc, o) => {
      acc.totalRevenue += o.grossRevenue - o.discounts;
      acc.totalCogs += o.totalCogs;
      acc.totalShippingCost += o.shippingCost;
      acc.totalFees += o.transactionFees;
      acc.totalAdSpend += o.adSpendAllocated;
      acc.totalRefunds += o.refundAmount;
      acc.totalChargebacks += o.chargebackAmount;
      acc.totalOtherCosts += o.otherCosts ?? 0;
      return acc;
    },
    {
      totalRevenue: 0, totalCogs: 0, totalShippingCost: 0,
      totalFees: 0, totalAdSpend: 0, totalRefunds: 0,
      totalChargebacks: 0, totalOtherCosts: 0,
    }
  );

  const netRevenue = totals.totalRevenue - totals.totalRefunds - totals.totalChargebacks;
  const grossProfit = netRevenue - totals.totalCogs;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const totalAllCosts =
    totals.totalCogs +
    totals.totalShippingCost +
    totals.totalFees +
    totals.totalAdSpend +
    totals.totalOtherCosts;
  const netProfit = netRevenue - totalAllCosts;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  const orderCount = orders.length;
  const avgOrderValue = orderCount > 0 ? netRevenue / orderCount : 0;
  const avgNetProfit = orderCount > 0 ? netProfit / orderCount : 0;

  return {
    ...Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, round(v)])
    ) as typeof totals,
    grossProfit: round(grossProfit),
    grossMargin: round(grossMargin),
    netProfit: round(netProfit),
    netMargin: round(netMargin),
    orderCount,
    avgOrderValue: round(avgOrderValue),
    avgNetProfit: round(avgNetProfit),
  };
}

/**
 * What-if simulator — forward-looking.
 * Drag price / COGS / ad spend sliders and see projected profit.
 */
export function calcSimulator(input: SimulatorInput): SimulatorResult {
  const fees = calcTransactionFees(
    input.sellingPrice,
    input.platformFeePercent,
    input.transactionFeePercent,
    input.transactionFeeFixed
  );
  const refundCostPerUnit = (input.refundRatePercent / 100) * input.sellingPrice;
  const effectiveCostPerUnit =
    input.cogs +
    input.shippingCost +
    fees +
    input.adSpendPerUnit +
    refundCostPerUnit;

  const profitPerUnit = input.sellingPrice - effectiveCostPerUnit;
  const profitMargin = input.sellingPrice > 0
    ? (profitPerUnit / input.sellingPrice) * 100
    : 0;
  const roi = effectiveCostPerUnit > 0
    ? (profitPerUnit / effectiveCostPerUnit) * 100
    : 0;
  const totalRevenue = input.sellingPrice * input.quantity;
  const totalProfit = profitPerUnit * input.quantity;
  const totalFees = fees * input.quantity;

  // Break-even: number of units where fixed costs (COGS + ship + fees) are covered
  const fixedCostPerUnit = input.cogs + input.shippingCost + fees;
  const marginContrib = input.sellingPrice - fixedCostPerUnit;
  const breakEvenUnits = marginContrib > 0
    ? Math.ceil((input.adSpendPerUnit * input.quantity) / marginContrib)
    : 0;
  const breakEvenPrice = effectiveCostPerUnit / (1 - input.refundRatePercent / 100);

  return {
    profitPerUnit: round(profitPerUnit),
    profitMargin: round(profitMargin),
    roi: round(roi),
    totalRevenue: round(totalRevenue),
    totalProfit: round(totalProfit),
    breakEvenUnits,
    breakEvenPrice: round(breakEvenPrice),
    totalFees: round(totalFees),
    effectiveCostPerUnit: round(effectiveCostPerUnit),
  };
}

/**
 * Ad platform metrics — ROAS, net profit, break-even ROAS, CPA.
 */
export function calcAdMetrics(input: AdSpendInput): AdMetrics {
  const totalCosts = input.totalSpend + input.totalCogs + input.totalFees;
  const netProfit = input.totalRevenue - totalCosts;
  const netMargin = input.totalRevenue > 0
    ? (netProfit / input.totalRevenue) * 100
    : 0;
  const roas = input.totalSpend > 0 ? input.totalRevenue / input.totalSpend : 0;
  const nonAdCosts = input.totalCogs + input.totalFees;
  const breakEvenRoas = input.totalSpend > 0
    ? (input.totalSpend + nonAdCosts) / input.totalSpend
    : 0;
  const cpa = input.conversions > 0 ? input.totalSpend / input.conversions : 0;
  const roi = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;

  return {
    roas: round(roas, 2),
    netProfit: round(netProfit),
    netMargin: round(netMargin),
    cpa: round(cpa),
    breakEvenRoas: round(breakEvenRoas, 2),
    roi: round(roi),
  };
}

/**
 * Rough quarterly tax set-aside estimate.
 * Assumes self-employment or pass-through entity.
 */
export function calcTaxSetAside(
  netProfit: number,
  effectiveTaxRate: number = 0.28
): { taxSetAside: number; afterTaxProfit: number; quarterlyPayment: number } {
  const taxSetAside = Math.max(0, netProfit * effectiveTaxRate);
  const afterTaxProfit = netProfit - taxSetAside;
  const quarterlyPayment = taxSetAside / 4;
  return {
    taxSetAside: round(taxSetAside),
    afterTaxProfit: round(afterTaxProfit),
    quarterlyPayment: round(quarterlyPayment),
  };
}

/**
 * Aggregate per-product profit from a list of orders.
 */
export function calcProductSummaries(
  lineItems: Array<{
    productId: string;
    name: string;
    sku?: string;
    price: number;
    cogs: number;
    quantity: number;
  }>
): ProductSummary[] {
  const map = new Map<string, ProductSummary>();

  for (const item of lineItems) {
    const key = item.productId;
    const rev = item.price * item.quantity;
    const cost = item.cogs * item.quantity;
    const profit = rev - cost;

    if (!map.has(key)) {
      map.set(key, {
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        totalRevenue: 0,
        totalCogs: 0,
        totalProfit: 0,
        totalOrders: 0,
        avgProfitMargin: 0,
        avgSellingPrice: 0,
      });
    }

    const entry = map.get(key)!;
    entry.totalRevenue += rev;
    entry.totalCogs += cost;
    entry.totalProfit += profit;
    entry.totalOrders += item.quantity;
  }

  return Array.from(map.values()).map((p) => ({
    ...p,
    totalRevenue: round(p.totalRevenue),
    totalCogs: round(p.totalCogs),
    totalProfit: round(p.totalProfit),
    avgProfitMargin:
      p.totalRevenue > 0
        ? round((p.totalProfit / p.totalRevenue) * 100)
        : 0,
    avgSellingPrice:
      p.totalOrders > 0 ? round(p.totalRevenue / p.totalOrders) : 0,
  }));
}

/**
 * Customer LTV estimate based on order history.
 */
export function calcCustomerLtv(orders: {
  netProfit: number;
  orderDate: Date;
}[]): {
  totalProfit: number;
  orderCount: number;
  avgOrderProfit: number;
  daysSinceFirstOrder: number;
  estimatedAnnualLtv: number;
} {
  if (!orders.length) {
    return { totalProfit: 0, orderCount: 0, avgOrderProfit: 0, daysSinceFirstOrder: 0, estimatedAnnualLtv: 0 };
  }

  const sorted = [...orders].sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime());
  const first = sorted[0].orderDate;
  const last = sorted[sorted.length - 1].orderDate;
  const daysSinceFirstOrder = Math.max(
    1,
    (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)
  );

  const totalProfit = orders.reduce((s, o) => s + o.netProfit, 0);
  const orderCount = orders.length;
  const avgOrderProfit = totalProfit / orderCount;
  const ordersPerDay = orderCount / daysSinceFirstOrder;
  const estimatedAnnualLtv = ordersPerDay * 365 * avgOrderProfit;

  return {
    totalProfit: round(totalProfit),
    orderCount,
    avgOrderProfit: round(avgOrderProfit),
    daysSinceFirstOrder: Math.round(daysSinceFirstOrder),
    estimatedAnnualLtv: round(estimatedAnnualLtv),
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * factor) / factor;
}
