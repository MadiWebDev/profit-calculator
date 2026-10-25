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

export interface ProductIntelRow extends RankedProduct {
  breakEven: BreakEvenResult;
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
      "lineItems status orderDate shippingCost transactionFees adSpendAllocated otherCosts packagingCost codFee rtoLoss expenseAllocation refundAmount"
    )
    .lean();

  const inputs: ProductIntelOrder[] = orders.map((o) => {
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
      price: li.price ?? 0,
      cogs: li.cogs ?? 0,
      totalRevenue: li.totalRevenue ?? 0,
      totalCogs: li.totalCogs ?? 0,
    }));
    return {
      lineItems: lines,
      status: o.status,
      orderDate: o.orderDate,
      shippingCost: o.shippingCost ?? 0,
      transactionFees: o.transactionFees ?? 0,
      adSpendAllocated: o.adSpendAllocated ?? 0,
      otherCosts: o.otherCosts ?? 0,
      packagingCost: o.packagingCost ?? 0,
      codFee: o.codFee ?? 0,
      rtoLoss: o.rtoLoss ?? 0,
      expenseAllocation: o.expenseAllocation ?? 0,
      refundAmount: o.refundAmount ?? 0,
    };
  });

  const ranked = rankProducts(inputs);
  const movers = productMovers(inputs, 30, opts.to ?? new Date());
  const targetMargin = opts.targetMargin ?? 0.25;

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
    return { ...row, breakEven };
  });

  return { products, movers };
}
