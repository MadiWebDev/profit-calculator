/**
 * F1 high-value analytics engines — pure functions over order snapshots,
 * so they are unit-testable without a database. Every engine takes the
 * same minimal order shape the profit engine already produces; callers
 * map real orders into it (see the F1 API routes).
 *
 * Money is in the store currency, 2dp. Nothing here mutates prices,
 * orders, or COGS — suggestions are returned, never applied (F1.5).
 */
export interface F1Order {
  id: string;
  revenue: number;
  netProfit: number;
  cogs: number;
  refundAmount?: number;
  status?: string;
  country?: string;
  courier?: string;
  discountCode?: string | null;
  discountAmount?: number;
  freeShipping?: boolean;
  productIds?: string[];
  productNames?: string[];
  variantId?: string;
  productId?: string;
  returnReason?: string | null;
  createdAt?: string;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** F1.2 Discount profitability per code + free-shipping thresholds. */
export function discountProfitability(orders: F1Order[]) {
  const byCode = new Map<string, { orders: number; revenue: number; profit: number; discount: number }>();
  let freeShipOrders = 0, freeShipProfit = 0, freeShipRevenue = 0;
  for (const o of orders) {
    if (o.freeShipping) { freeShipOrders++; freeShipProfit += o.netProfit; freeShipRevenue += o.revenue; }
    if (!o.discountCode) continue;
    const e = byCode.get(o.discountCode) ?? { orders: 0, revenue: 0, profit: 0, discount: 0 };
    e.orders++; e.revenue += o.revenue; e.profit += o.netProfit; e.discount += o.discountAmount ?? 0;
    byCode.set(o.discountCode, e);
  }
  const codes = [...byCode.entries()].map(([code, e]) => ({
    code, ...e, revenue: r2(e.revenue), profit: r2(e.profit), discount: r2(e.discount),
    margin: e.revenue ? r2((e.profit / e.revenue) * 100) : 0,
    losesMoney: e.profit < 0,
    alert: e.profit < 0 ? "This code loses money — raise the threshold or cap the discount." : null,
  })).sort((a, b) => a.profit - b.profit);
  return { codes, freeShipping: { orders: freeShipOrders, revenue: r2(freeShipRevenue), profit: r2(freeShipProfit) } };
}

/** F1.3 Returns / refunds analytics. */
export function returnsAnalytics(orders: F1Order[]) {
  const total = orders.length || 1;
  const returned = orders.filter((o) => (o.refundAmount ?? 0) > 0 || o.status === "refunded");
  const byProduct = new Map<string, { orders: number; returns: number; cost: number }>();
  const byReason = new Map<string, number>();
  const byCourier = new Map<string, { orders: number; returns: number }>();
  const byCountry = new Map<string, { orders: number; returns: number }>();
  for (const o of orders) {
    const isRet = (o.refundAmount ?? 0) > 0 || o.status === "refunded";
    const p = byProduct.get(o.productId ?? "unknown") ?? { orders: 0, returns: 0, cost: 0 };
    p.orders++; if (isRet) { p.returns++; p.cost += o.refundAmount ?? 0; }
    byProduct.set(o.productId ?? "unknown", p);
    if (isRet && o.returnReason) byReason.set(o.returnReason, (byReason.get(o.returnReason) ?? 0) + 1);
    const c = byCourier.get(o.courier ?? "unknown") ?? { orders: 0, returns: 0 };
    c.orders++; if (isRet) c.returns++;
    byCourier.set(o.courier ?? "unknown", c);
    const co = byCountry.get(o.country ?? "unknown") ?? { orders: 0, returns: 0 };
    co.orders++; if (isRet) co.returns++;
    byCountry.set(o.country ?? "unknown", co);
  }
  const problemProducts = [...byProduct.entries()]
    .map(([productId, e]) => ({ productId, ...e, returnRate: e.orders ? r2((e.returns / e.orders) * 100) : 0, cost: r2(e.cost) }))
    .filter((e) => e.returns > 0 && e.returnRate >= 10)
    .sort((a, b) => b.returnRate - a.returnRate);
  return {
    returnRate: r2((returned.length / total) * 100),
    returnedOrders: returned.length,
    totalOrders: orders.length,
    costOfReturns: r2(returned.reduce((s, o) => s + (o.refundAmount ?? 0), 0)),
    byReason: [...byReason.entries()].map(([reason, count]) => ({ reason, count })),
    byCourier: [...byCourier.entries()].map(([courier, e]) => ({ courier, ...e, returnRate: e.orders ? r2((e.returns / e.orders) * 100) : 0 })),
    byCountry: [...byCountry.entries()].map(([country, e]) => ({ country, ...e, returnRate: e.orders ? r2((e.returns / e.orders) * 100) : 0 })),
    problemProducts: problemProducts.map((p) => ({ ...p, suggestedAction: "Review quality, sizing info, or courier handling for this product before scaling ads." })),
  };
}

/** F1.4 Market basket: products bought together + pairing profit. */
export function marketBasket(orders: F1Order[], minSupport = 2) {
  const pairCount = new Map<string, { a: string; b: string; count: number; profit: number }>();
  for (const o of orders) {
    const ids = [...new Set(o.productIds ?? [])];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const key = `${a}||${b}`;
        const e = pairCount.get(key) ?? { a, b, count: 0, profit: 0 };
        e.count++; e.profit += o.netProfit;
        pairCount.set(key, e);
      }
    }
  }
  return [...pairCount.values()]
    .filter((p) => p.count >= minSupport)
    .map((p) => ({ ...p, profit: r2(p.profit), bundleSuggestion: `Bundle ${p.a} + ${p.b} (bought together ${p.count}×).` }))
    .sort((a, b) => b.count - a.count);
}

/** F1.5 Pricing optimizer: suggested price change, simulated impact, never applied. */
export function pricingOptimizer(input: {
  productId: string; currentPrice: number; unitCost: number; adCostPerOrder: number;
  orders: number; conversionRate: number; // 0–1
}): { productId: string; currentMargin: number; suggestedPrice: number; simulatedProfitDelta: number; rationale: string } {
  const { currentPrice, unitCost, adCostPerOrder, orders, conversionRate } = input;
  const currentMargin = currentPrice ? r2(((currentPrice - unitCost - adCostPerOrder) / currentPrice) * 100) : 0;
  // Heuristic: if margin < 20%, suggest +10% price (conversion assumed -5%
  // relative); if margin > 60% and conversion < 2%, suggest -5% to grow volume.
  let suggestedPrice = currentPrice;
  let rationale = "Price is in a healthy band; no change suggested.";
  if (currentMargin < 20) { suggestedPrice = r2(currentPrice * 1.1); rationale = "Margin is thin; a 10% increase protects profit even with a small conversion dip."; }
  else if (currentMargin > 60 && conversionRate < 0.02) { suggestedPrice = r2(currentPrice * 0.95); rationale = "High margin but low conversion; a 5% cut may grow volume enough to raise total profit."; }
  const currentProfitPerOrder = currentPrice - unitCost - adCostPerOrder;
  const suggestedProfitPerOrder = suggestedPrice - unitCost - adCostPerOrder;
  const volumeFactor = suggestedPrice > currentPrice ? 0.95 : suggestedPrice < currentPrice ? 1.08 : 1;
  const simulatedProfitDelta = r2((suggestedProfitPerOrder * orders * volumeFactor) - (currentProfitPerOrder * orders));
  return { productId: input.productId, currentMargin, suggestedPrice, simulatedProfitDelta, rationale };
}

/** F1.6 Inventory: reorder points by sell-through + dead stock. */
export function inventoryAnalysis(items: { productId: string; stock: number; soldLast30d: number; leadTimeDays: number; unitCost: number }[]) {
  return items.map((it) => {
    const daily = it.soldLast30d / 30;
    const reorderPoint = Math.ceil(daily * it.leadTimeDays);
    const daysOfStock = daily > 0 ? Math.floor(it.stock / daily) : Infinity;
    return {
      ...it, dailySellThrough: r2(daily), reorderPoint,
      needsReorder: it.stock <= reorderPoint,
      deadStock: daily === 0 && it.stock > 0,
      deadStockCapital: daily === 0 ? r2(it.stock * it.unitCost) : 0,
      daysOfStock: Number.isFinite(daysOfStock) ? daysOfStock : null,
    };
  });
}

/** F1.8 Cash-flow forecast: payouts, COD settlements, ad bills, expenses. */
export function cashFlowForecast(input: {
  expectedPayouts: { date: string; amount: number }[];
  codSettlements: { date: string; amount: number }[];
  adBills: { date: string; amount: number }[];
  expenses: { date: string; amount: number }[];
  currentBalance: number;
  dailyBurn: number;
}): { byDate: { date: string; inflow: number; outflow: number; balance: number }[]; daysOfRunway: number | null } {
  const map = new Map<string, { inflow: number; outflow: number }>();
  const add = (date: string, inflow: number, outflow: number) => {
    const e = map.get(date) ?? { inflow: 0, outflow: 0 };
    e.inflow += inflow; e.outflow += outflow; map.set(date, e);
  };
  for (const p of input.expectedPayouts) add(p.date, p.amount, 0);
  for (const p of input.codSettlements) add(p.date, p.amount, 0);
  for (const p of input.adBills) add(p.date, 0, p.amount);
  for (const p of input.expenses) add(p.date, 0, p.amount);
  let balance = input.currentBalance;
  const byDate = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => {
    balance = r2(balance + e.inflow - e.outflow);
    return { date, inflow: r2(e.inflow), outflow: r2(e.outflow), balance };
  });
  return { byDate, daysOfRunway: input.dailyBurn > 0 ? Math.floor(input.currentBalance / input.dailyBurn) : null };
}

/** F1.13 Benchmarks (opt-in, anonymized): cohort minimum enforced. */
export function benchmarkCompare(store: { margin: number; refundRate: number; rtoRate: number }, cohort: { margin: number; refundRate: number; rtoRate: number }[], minCohort = 10) {
  if (cohort.length < minCohort) {
    return { available: false, reason: `Cohort too small (${cohort.length}/${minCohort}) — benchmarks are withheld to prevent re-identification.` };
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    available: true, cohortSize: cohort.length,
    margin: { store: store.margin, cohortAvg: r2(avg(cohort.map((c) => c.margin))) },
    refundRate: { store: store.refundRate, cohortAvg: r2(avg(cohort.map((c) => c.refundRate))) },
    rtoRate: { store: store.rtoRate, cohortAvg: r2(avg(cohort.map((c) => c.rtoRate))) },
  };
}
