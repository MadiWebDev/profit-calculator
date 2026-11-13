/**
 * Server bridge for product intelligence (thin wrapper over the pure
 * module in `@/lib/product-intel`, per decision D6).
 *
 * Break-even inputs need per-cost-type per-unit averages, which
 * `rankProducts` does not split out (it only totals allocated costs).
 * This bridge re-applies the same revenue-share allocation per cost
 * type: within one order, each cost type is split across lines in
 * proportion to line revenue (equal split when the order has no
 * revenue — matching the pure module's fallback). Per-unit figures
 * are the allocated sums divided by units. Totals therefore reconcile
 * with `rankProducts`' allocatedCosts up to rounding.
 */
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import {
  rankProducts,
  productMovers,
  breakEvenForProduct,
  type ProductIntelOrder,
  type RankedProduct,
  type ProductMover,
  type BreakEvenResult,
} from "@/lib/product-intel";
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";
import { getSyncedAdSpend } from "@/lib/ad-spend";
import { round } from "@/lib/profit-engine";

export interface ProductIntelRow extends RankedProduct {
  breakEven: BreakEvenResult;
  /**
   * Synced (AdSpendDaily) spend allocated to this product by revenue
   * share (F5). 0 when there is no synced spend in the period.
   */
  syncedAdSpend: number;
}

export async function getProductIntel(
  teamId: string,
  opts: { from?: Date; to?: Date; storeId?: string; targetMargin?: number }
): Promise<{ products: ProductIntelRow[]; movers: ProductMover[] }> {
  await connectDB();

  const match: Record<string, unknown> = { teamId };
  if (opts.storeId) match.storeId = opts.storeId;
  if (opts.from || opts.to) {
    match.orderDate = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }

  const orders = await OrderModel.find(match)
    .select(
      "currency lineItems status orderDate shippingCost transactionFees adSpendAllocated otherCosts packagingCost codFee rtoLoss expenseAllocation refundAmount"
    )
    .lean();

  // Product rankings sum line-item revenue and allocated costs across
  // orders; convert each order into the report base currency first so
  // a multi-currency team is not ranked on 1:1 mixed-currency sums.
  const base = await getReportBaseCurrency(teamId, opts.storeId);
  const rates = await getReportRates(base);

  const inputs: ProductIntelOrder[] = orders.map((o) => {
    const from = (o as { currency?: string }).currency ?? base;
    const conv = (v?: number | null) => convertAmount(v ?? 0, from, base, rates);
    const lines = (o.lineItems ?? []).map((li: {
      productId?: unknown;
      sku?: string;
      name: string;
      quantity?: number;
      price?: number;
      cogs?: number;
      totalRevenue?: number;
      totalCogs?: number;
    }) => ({
      productId: li.productId ? String(li.productId) : undefined,
      sku: li.sku ?? undefined,
      name: li.name,
      quantity: li.quantity ?? 0,
      price: conv(li.price),
      cogs: conv(li.cogs),
      totalRevenue: conv(li.totalRevenue),
      totalCogs: conv(li.totalCogs),
    }));
    return {
      lineItems: lines,
      status: o.status,
      orderDate: o.orderDate,
      shippingCost: conv(o.shippingCost),
      transactionFees: conv(o.transactionFees),
      adSpendAllocated: conv(o.adSpendAllocated),
      otherCosts: conv(o.otherCosts),
      packagingCost: conv(o.packagingCost),
      codFee: conv(o.codFee),
      rtoLoss: conv(o.rtoLoss),
      expenseAllocation: conv(o.expenseAllocation),
      refundAmount: conv(o.refundAmount),
    };
  });

  const ranked = rankProducts(inputs);
  const movers = productMovers(inputs, 30, opts.to ?? new Date());
  const targetMargin = opts.targetMargin ?? 0.25;

  // F5 — APPROACH: synced spend has no campaign→product mapping
  // anywhere (AdSpendDaily carries no product/SKU field), so it
  // cannot be attributed to products exactly. The period's synced
  // total is therefore distributed across products by revenue share —
  // the same allocation method this module already uses for order
  // costs — and added to each product's ad spend. Σ per-product
  // synced shares = the period total (largest-remainder rounding),
  // so product totals reconcile with the dashboard/profit totals.
  // When there is no revenue in the period the spend is unattributable
  // to any product and stays at the period level only.
  const syncedByProduct = new Map<string, number>();
  const totalRevenue = ranked.reduce((s, r) => s + r.revenue, 0);
  if (totalRevenue > 0) {
    const orderDates = orders
      .map((o) => new Date(o.orderDate).getTime())
      .filter((t) => Number.isFinite(t));
    const rangeFrom = opts.from ?? (orderDates.length ? new Date(Math.min(...orderDates)) : undefined);
    const rangeTo = opts.to ?? (orderDates.length ? new Date(Math.max(...orderDates)) : undefined);
    const synced = await getSyncedAdSpend(teamId, rangeFrom, rangeTo, base, {
      rates,
      ...(opts.storeId ? { storeId: opts.storeId } : {}),
    });
    if (synced.total > 0) {
      let allocated = 0;
      ranked.forEach((row, i) => {
        const share =
          i === ranked.length - 1
            ? round(synced.total - allocated)
            : round(synced.total * (row.revenue / totalRevenue));
        allocated += share;
        syncedByProduct.set(row.key, share);
      });
    }
  }

  // Per-type revenue-share allocation for break-even unit costs.
  const perType = new Map<
    string,
    { shipping: number; fees: number; adSpend: number; other: number; units: number }
  >();
  for (const order of inputs) {
    if (order.status === "cancelled") continue;
    const lines = order.lineItems;
    if (lines.length === 0) continue;
    const totalRevenue = lines.reduce((s, li) => s + (li.totalRevenue ?? 0), 0);
    const costs = {
      shipping: order.shippingCost ?? 0,
      fees: order.transactionFees ?? 0,
      adSpend: order.adSpendAllocated ?? 0,
      other:
        (order.otherCosts ?? 0) +
        (order.packagingCost ?? 0) +
        (order.codFee ?? 0) +
        (order.rtoLoss ?? 0) +
        (order.expenseAllocation ?? 0),
    };
    lines.forEach((li) => {
      const key = li.productId || li.sku || li.name || "unknown";
      const share =
        totalRevenue > 0 ? (li.totalRevenue ?? 0) / totalRevenue : 1 / lines.length;
      const agg = perType.get(key) ?? { shipping: 0, fees: 0, adSpend: 0, other: 0, units: 0 };
      agg.shipping += costs.shipping * share;
      agg.fees += costs.fees * share;
      agg.adSpend += costs.adSpend * share;
      agg.other += costs.other * share;
      agg.units += li.quantity ?? 0;
      perType.set(key, agg);
    });
  }

  const products: ProductIntelRow[] = ranked.map((row) => {
    const agg = perType.get(row.key);
    const units = agg?.units ?? row.units;
    // F5: the product's share of synced spend also raises its
    // per-unit ad spend in the break-even price.
    if (agg) agg.adSpend += syncedByProduct.get(row.key) ?? 0;
    const syncedShare = syncedByProduct.get(row.key) ?? 0;
    const allocatedCosts = round(row.allocatedCosts + syncedShare);
    const fullyLoadedProfit = round(row.fullyLoadedProfit - syncedShare);
    const breakEven = breakEvenForProduct(
      {
        avgCogsPerUnit: row.avgCogsPerUnit,
        avgShippingPerUnit: units > 0 ? (agg?.shipping ?? 0) / units : 0,
        avgFeesPerUnit: units > 0 ? (agg?.fees ?? 0) / units : 0,
        avgAdSpendPerUnit: units > 0 ? (agg?.adSpend ?? 0) / units : 0,
        avgOtherPerUnit: units > 0 ? (agg?.other ?? 0) / units : 0,
        avgPrice: row.avgPrice,
      },
      targetMargin
    );
    return {
      ...row,
      syncedAdSpend: round(syncedShare),
      allocatedCosts,
      fullyLoadedProfit,
      fullyLoadedMargin:
        row.revenue > 0 ? round((fullyLoadedProfit / row.revenue) * 100) : 0,
      breakEven,
    };
  });

  return { products, movers };
}
