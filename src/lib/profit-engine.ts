/**
 * GetProfitCalc Core Profit Engine
 * Pure functions — no side effects, no DB calls, fully testable.
 *
 * ─── MONEY CONTRACT (read before touching these functions) ──────────────────
 * Every function takes amounts in ONE currency. Mixing currencies is a caller
 * bug — normalize with convertCurrency() first (rates from src/lib/fx.ts).
 *
 * OrderCosts field semantics (all providers normalized to this):
 * - grossRevenue:    TAX-EXCLUSIVE total charged to the customer =
 *                    merchandise after discounts + shipping charged.
 *                    (Shopify total_price − total_tax, Etsy grandtotal − taxes,
 *                    WooCommerce total − total_tax.)
 * - discounts:       INFORMATIONAL memo — discount amount granted. It is
 *                    ALREADY reflected in grossRevenue; never subtract it again.
 * - shippingRevenue: INFORMATIONAL memo — shipping portion already included
 *                    in grossRevenue; never add it again.
 * - taxes:           Pass-through collected for the government. Never part of
 *                    revenue or profit.
 * - refundAmount / chargebackAmount: money returned to customers; these DO
 *                    reduce net revenue.
 * - totalCogs / shippingCost / transactionFees / adSpendAllocated / otherCosts:
 *                    true merchant costs; reduce profit but not revenue.
 *
 * Canonical formulas:
 *   netRevenue = grossRevenue − refundAmount − chargebackAmount
 *   grossProfit = netRevenue − totalCogs
 *   netProfit  = netRevenue − totalCogs − shippingCost − transactionFees
 *                − adSpendAllocated − otherCosts
 *
 * All money outputs are rounded to 2dp (half-up); margins to 2dp percentages.
 * Non-finite inputs (NaN/undefined/Infinity) are coerced to 0 at the boundary
 * so one bad field can never poison a whole report.
 */

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface OrderCosts {
  grossRevenue: number;
  discounts: number;
  shippingRevenue: number;   // memo: shipping portion already inside grossRevenue
  shippingCost: number;      // what merchant paid to ship
  totalCogs: number;         // sum of line-item COGS
  transactionFees: number;   // platform + payment gateway fees
  taxes: number;             // pass-through, excluded from revenue AND profit
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

export interface BundleComponentInput {
  cogs: number;
  quantity: number;
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
  breakEvenPrice: number;    // 0 when break-even is unreachable (refundRate ≥ 100%)
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
  totalOrders: number;       // total UNITS sold (named for back-compat)
  avgProfitMargin: number;   // %
  avgSellingPrice: number;   // average revenue per unit
}

export interface BundleMargin {
  totalCogs: number;
  grossProfit: number;
  grossMargin: number;       // %
  fees: number;
  netProfit: number;
  netMargin: number;         // %
}

/** FX rates quoted as units of currency per 1 USD (open.er-api.com convention). */
export interface FxRates {
  base: string;              // e.g. "USD"
  rates: Record<string, number>;
  fetchedAt: string;         // ISO timestamp
}

// ─── Sanitization ─────────────────────────────────────────────────────────────

/**
 * Coerce any value to a finite number. Non-finite (NaN, ±Infinity,
 * undefined, null, non-numeric) becomes 0 — one bad field must never
 * poison a whole report with NaN.
 */
export function toMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeCosts(costs: OrderCosts): Required<OrderCosts> {
  return {
    grossRevenue:     toMoney(costs.grossRevenue),
    discounts:        toMoney(costs.discounts),
    shippingRevenue:  toMoney(costs.shippingRevenue),
    shippingCost:     toMoney(costs.shippingCost),
    totalCogs:        toMoney(costs.totalCogs),
    transactionFees:  toMoney(costs.transactionFees),
    taxes:            toMoney(costs.taxes),
    refundAmount:     toMoney(costs.refundAmount),
    chargebackAmount: toMoney(costs.chargebackAmount),
    adSpendAllocated: toMoney(costs.adSpendAllocated),
    otherCosts:       toMoney(costs.otherCosts ?? 0),
  };
}

// ─── Core Calculations ────────────────────────────────────────────────────────

/**
 * Calculate net profit for a single order.
 *
 *   netRevenue = grossRevenue − refundAmount − chargebackAmount
 *   netProfit  = netRevenue − totalCogs − shippingCost − transactionFees
 *                − adSpendAllocated − otherCosts
 *
 * grossRevenue is tax-exclusive and already net of discounts (see MONEY
 * CONTRACT above); discounts/shippingRevenue/taxes are memos and never
 * enter the formula.
 */
export function calcOrderProfit(costs: OrderCosts): OrderProfit {
  const c = sanitizeCosts(costs);

  // Round money first so every output is mutually consistent: margins are
  // ratios of the ROUNDED values the caller actually sees.
  const netRevenue = round(c.grossRevenue - c.refundAmount - c.chargebackAmount);
  const totalCogs = round(c.totalCogs);
  const totalCosts = round(
    c.totalCogs +
    c.shippingCost +
    c.transactionFees +
    c.adSpendAllocated +
    c.otherCosts
  );

  const grossProfit = round(netRevenue - totalCogs);
  const grossMargin = netRevenue > 0 ? round((grossProfit / netRevenue) * 100) : 0;

  const netProfit = round(netRevenue - totalCosts);
  const netMargin = netRevenue > 0 ? round((netProfit / netRevenue) * 100) : 0;

  return {
    netRevenue,
    grossProfit,
    grossMargin,
    netProfit,
    netMargin,
    totalCosts,
  };
}

/**
 * Calculate total COGS for a list of line items.
 */
export function calcLineItemsCogs(items: LineItemInput[]): number {
  return round(
    items.reduce((sum, item) => sum + toMoney(item.cogs) * toMoney(item.quantity), 0)
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
  const v = toMoney(orderValue);
  const pct = ((toMoney(platformFeePercent) + toMoney(gatewayFeePercent)) / 100) * v;
  return round(pct + toMoney(gatewayFixedFee));
}

/**
 * Aggregate a set of orders into a period-level summary.
 *
 * Additivity guarantee: this applies the SAME formula as calcOrderProfit to
 * the summed components, so period.netProfit === Σ order.netProfit
 * (up to rounding) and every identity that holds per-order holds for the period.
 */
export function calcPeriodSummary(orders: OrderCosts[]): PeriodSummary {
  const totals = orders.reduce(
    (acc, o) => {
      const c = sanitizeCosts(o);
      acc.grossRevenue     += c.grossRevenue;
      acc.totalCogs        += c.totalCogs;
      acc.totalShippingCost += c.shippingCost;
      acc.totalFees        += c.transactionFees;
      acc.totalAdSpend     += c.adSpendAllocated;
      acc.totalRefunds     += c.refundAmount;
      acc.totalChargebacks += c.chargebackAmount;
      acc.totalOtherCosts  += c.otherCosts;
      return acc;
    },
    {
      grossRevenue: 0, totalCogs: 0, totalShippingCost: 0,
      totalFees: 0, totalAdSpend: 0, totalRefunds: 0,
      totalChargebacks: 0, totalOtherCosts: 0,
    }
  );

  // Same core formula as calcOrderProfit, applied to the sums.
  // Sums are rounded first so period outputs are mutually consistent and
  // additivity holds on the values callers actually see.
  const grossRevenue = round(totals.grossRevenue);
  const totalRefunds = round(totals.totalRefunds);
  const totalChargebacks = round(totals.totalChargebacks);
  const totalCogs = round(totals.totalCogs);

  const netRevenue  = round(grossRevenue - totalRefunds - totalChargebacks);
  const grossProfit = round(netRevenue - totalCogs);
  const grossMargin = netRevenue > 0 ? round((grossProfit / netRevenue) * 100) : 0;
  const totalAllCosts = round(
    totals.totalCogs +
    totals.totalShippingCost +
    totals.totalFees +
    totals.totalAdSpend +
    totals.totalOtherCosts
  );
  const netProfit = round(netRevenue - totalAllCosts);
  const netMargin = netRevenue > 0 ? round((netProfit / netRevenue) * 100) : 0;

  const orderCount = orders.length;
  const avgOrderValue = orderCount > 0 ? round(netRevenue / orderCount) : 0;
  const avgNetProfit = orderCount > 0 ? round(netProfit / orderCount) : 0;

  return {
    totalRevenue:     grossRevenue,
    totalCogs,
    totalShippingCost: round(totals.totalShippingCost),
    totalFees:        round(totals.totalFees),
    totalAdSpend:     round(totals.totalAdSpend),
    totalRefunds,
    totalChargebacks,
    totalOtherCosts:  round(totals.totalOtherCosts),
    grossProfit,
    grossMargin,
    netProfit,
    netMargin,
    orderCount,
    avgOrderValue,
    avgNetProfit,
  };
}

/**
 * What-if simulator — forward-looking.
 * Drag price / COGS / ad spend sliders and see projected profit.
 */
export function calcSimulator(input: SimulatorInput): SimulatorResult {
  const sellingPrice      = toMoney(input.sellingPrice);
  const cogs              = toMoney(input.cogs);
  const shippingCost      = toMoney(input.shippingCost);
  const adSpendPerUnit    = toMoney(input.adSpendPerUnit);
  const quantity          = Math.max(0, Math.floor(toMoney(input.quantity)));
  // Clamp refund rate to [0, 100) — at 100% break-even is unreachable and
  // the break-even price formula would divide by zero.
  const refundRatePercent = Math.min(99.99, Math.max(0, toMoney(input.refundRatePercent)));

  const fees = calcTransactionFees(
    sellingPrice,
    input.platformFeePercent,
    input.transactionFeePercent,
    input.transactionFeeFixed
  );
  const refundCostPerUnit = (refundRatePercent / 100) * sellingPrice;
  const effectiveCostPerUnit =
    cogs +
    shippingCost +
    fees +
    adSpendPerUnit +
    refundCostPerUnit;

  const profitPerUnit = sellingPrice - effectiveCostPerUnit;
  const profitMargin = sellingPrice > 0
    ? (profitPerUnit / sellingPrice) * 100
    : 0;
  const roi = effectiveCostPerUnit > 0
    ? (profitPerUnit / effectiveCostPerUnit) * 100
    : 0;
  const totalRevenue = sellingPrice * quantity;
  const totalProfit = profitPerUnit * quantity;
  const totalFees = fees * quantity;

  // Break-even: units where the contribution margin covers total ad spend
  const fixedCostPerUnit = cogs + shippingCost + fees;
  const marginContrib = sellingPrice - fixedCostPerUnit;
  const breakEvenUnits = marginContrib > 0
    ? Math.ceil((adSpendPerUnit * quantity) / marginContrib)
    : 0;
  // Price that zeroes profit after expected refunds; denominator > 0 by clamp
  const breakEvenPrice = effectiveCostPerUnit / (1 - refundRatePercent / 100);

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
  const totalSpend   = toMoney(input.totalSpend);
  const totalRevenue = toMoney(input.totalRevenue);
  const totalCogs    = toMoney(input.totalCogs);
  const totalFees    = toMoney(input.totalFees);
  const conversions  = toMoney(input.conversions);

  const totalCosts = totalSpend + totalCogs + totalFees;
  const netProfit = totalRevenue - totalCosts;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const nonAdCosts = totalCogs + totalFees;
  const breakEvenRoas = totalSpend > 0 ? (totalSpend + nonAdCosts) / totalSpend : 0;
  const cpa = conversions > 0 ? totalSpend / conversions : 0;
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
 * Bundle margin — consolidates the inline math previously duplicated in
 * POST /api/bundles. A bundle sells at `sellingPrice`; its COGS is the
 * quantity-weighted sum of components; fees are a % of the selling price.
 */
export function calcBundleMargin(
  components: BundleComponentInput[],
  sellingPrice: number,
  feesPct: number = 0
): BundleMargin {
  const price = toMoney(sellingPrice);
  const totalCogs = components.reduce(
    (s, c) => s + toMoney(c.cogs) * toMoney(c.quantity),
    0
  );
  const grossProfit = price - totalCogs;
  const grossMargin = price > 0 ? (grossProfit / price) * 100 : 0;
  const fees = (price * toMoney(feesPct)) / 100;
  const netProfit = grossProfit - fees;
  const netMargin = price > 0 ? (netProfit / price) * 100 : 0;

  return {
    totalCogs: round(totalCogs),
    grossProfit: round(grossProfit),
    grossMargin: round(grossMargin),
    fees: round(fees),
    netProfit: round(netProfit),
    netMargin: round(netMargin),
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
  const profit = toMoney(netProfit);
  const rate = Math.min(1, Math.max(0, toMoney(effectiveTaxRate)));
  const taxSetAside = Math.max(0, profit * rate);
  const afterTaxProfit = profit - taxSetAside;
  const quarterlyPayment = taxSetAside / 4;
  return {
    taxSetAside: round(taxSetAside),
    afterTaxProfit: round(afterTaxProfit),
    quarterlyPayment: round(quarterlyPayment),
  };
}

/**
 * Aggregate per-product profit from a list of line items.
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
    const rev = toMoney(item.price) * toMoney(item.quantity);
    const cost = toMoney(item.cogs) * toMoney(item.quantity);
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

    const entry = map.get(key);
    if (!entry) continue;
    entry.totalRevenue += rev;
    entry.totalCogs += cost;
    entry.totalProfit += profit;
    entry.totalOrders += toMoney(item.quantity);
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
  const rawDays = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceFirstOrder = Math.max(1, toMoney(rawDays));

  const totalProfit = orders.reduce((s, o) => s + toMoney(o.netProfit), 0);
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

// ─── FX Conversion ────────────────────────────────────────────────────────────

/**
 * Convert an amount between currencies using a rates table.
 *
 * Rates are quoted as units of currency per 1 USD (the open.er-api.com
 * convention, e.g. { USD: 1, EUR: 0.92, PKR: 278.5 }).
 * Same-currency conversion is exact (no rounding drift).
 * Throws on unknown currency codes — silently returning the unconverted
 * amount would be worse than failing loudly.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  const value = toMoney(amount);
  const fromCode = from.toUpperCase().trim();
  const toCode = to.toUpperCase().trim();
  if (fromCode === toCode) return round(value);

  const fromRate = toMoney(rates[fromCode]);
  const toRate = toMoney(rates[toCode]);
  if (fromRate <= 0) throw new Error(`Unknown FX rate for currency: ${fromCode}`);
  if (toRate <= 0) throw new Error(`Unknown FX rate for currency: ${toCode}`);

  return round((value / fromRate) * toRate);
}

/**
 * Convert a whole OrderCosts object into another currency.
 * Memo fields (discounts, shippingRevenue, taxes) convert too so reports
 * stay internally consistent.
 */
export function convertOrderCosts(
  costs: OrderCosts,
  from: string,
  to: string,
  rates: Record<string, number>
): OrderCosts {
  const c = (n: number) => convertCurrency(n, from, to, rates);
  return {
    grossRevenue:     c(costs.grossRevenue),
    discounts:        c(costs.discounts),
    shippingRevenue:  c(costs.shippingRevenue),
    shippingCost:     c(costs.shippingCost),
    totalCogs:        c(costs.totalCogs),
    transactionFees:  c(costs.transactionFees),
    taxes:            c(costs.taxes),
    refundAmount:     c(costs.refundAmount),
    chargebackAmount: c(costs.chargebackAmount),
    adSpendAllocated: c(costs.adSpendAllocated),
    otherCosts:       costs.otherCosts === undefined ? undefined : c(costs.otherCosts),
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Round to `decimals` places (half-up), safe against floating-point error.
 * Non-finite inputs become 0 via toMoney — round() never returns NaN/Infinity.
 * Negative zero is normalized to 0 (Object.is(-0, 0) === false).
 */
export function round(n: number, decimals = 2): number {
  const value = toMoney(n);
  const factor = Math.pow(10, decimals);
  const result = Math.round((value + Number.EPSILON) * factor) / factor;
  return result === 0 ? 0 : result;
}
