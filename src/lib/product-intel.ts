/**
 * Product intelligence — pure functions, no DB, no network.
 *
 * Goes beyond the gross winners/losers table in GET /api/analytics/profit
 * (revenue − COGS only) in three ways:
 *   1. Fully-loaded profit: every order's non-COGS costs are pushed down to
 *      its lines, so a product's profit reflects shipping, fees, ad spend,
 *      packaging, COD fees, RTO loss and allocated expenses — not just COGS.
 *   2. Break-even / pricing: the per-unit price a product must charge to
 *      cover all per-unit costs, and the price needed for a target margin.
 *   3. Movers: units in a recent window vs the equal-length prior window.
 *
 * ─── ALLOCATION METHOD (rankProducts) ─────────────────────────────────────
 * For each order, its non-COGS costs are:
 *   shippingCost + transactionFees + adSpendAllocated + otherCosts
 *   + packagingCost + codFee + rtoLoss + expenseAllocation
 * Each line receives a share of that total proportional to its share of the
 * order's line revenue (line totalRevenue / sum of line totalRevenue).
 * Shares are rounded to 2dp with a largest-remainder rule: all lines but
 * the last take their rounded share, and the last line takes the exact
 * remainder, so allocated costs always sum to the order's non-COGS total
 * to the cent. When an order's lines carry no revenue at all (sum 0),
 * costs are split equally across its lines instead — never guessed from
 * quantity or price alone.
 *
 * Identity: summed over an order's products,
 *   Σ fullyLoadedProfit = Σ line revenue − Σ line COGS − non-COGS costs.
 * Note the money-contract convention from profit-engine: discounts are
 * already reflected in grossRevenue and are never subtracted again, and
 * grossRevenue also contains shipping charged, so Σ line revenue is not
 * in general equal to grossRevenue. The identity above is in terms of
 * line revenue; callers comparing against order-level profit must use
 * the same revenue basis.
 *
 * ─── CONVENTIONS ──────────────────────────────────────────────────────────
 * - Cancelled orders are excluded everywhere. Refunded orders are kept
 *   (their recorded line revenues stand); refund exposure is surfaced
 *   separately as refundOrderShare.
 * - Products are grouped by productId, falling back to sku, then name.
 * - All money outputs are rounded to 2dp; margins are 2dp percentages.
 * - Non-finite inputs (NaN/undefined/Infinity) are coerced to 0 via
 *   toMoney, so one bad field never poisons a whole report.
 * - breakEvenForProduct takes all per-unit inputs explicitly. The server
 *   bridge computes those per-unit averages from orders (total cost /
 *   total units); this module deliberately does not guess them.
 * - Movers windows: recent = [now − recentDays, now], prior =
 *   [now − 2 × recentDays, now − recentDays). An order with no usable
 *   orderDate cannot be placed in a window and is skipped.
 */

import { round, toMoney } from "@/lib/profit-engine";

// ─── Input types ──────────────────────────────────────────────────────────

export interface ProductIntelLineItem {
  productId?: string;
  sku?: string;
  name?: string;
  quantity: number;
  price: number;
  cogs: number;
  totalRevenue: number;
  totalCogs: number;
}

export interface ProductIntelOrder {
  lineItems: ProductIntelLineItem[];
  status?: string;
  orderDate?: string | Date;
  shippingCost?: number;
  transactionFees?: number;
  adSpendAllocated?: number;
  otherCosts?: number;
  packagingCost?: number;
  codFee?: number;
  rtoLoss?: number;
  expenseAllocation?: number;
  refundAmount?: number;
}

// ─── rankProducts ─────────────────────────────────────────────────────────

export interface RankedProduct {
  key: string;
  productId?: string;
  sku?: string;
  name: string;
  units: number;
  ordersCount: number;
  revenue: number;
  cogs: number;
  directProfit: number;
  directMargin: number;
  allocatedCosts: number;
  fullyLoadedProfit: number;
  fullyLoadedMargin: number;
  avgPrice: number;
  avgCogsPerUnit: number;
  refundOrderShare: number;
}

function productKey(line: ProductIntelLineItem): string {
  return line.productId || line.sku || line.name || "unknown";
}

function orderNonCogsCosts(order: ProductIntelOrder): number {
  return (
    toMoney(order.shippingCost) +
    toMoney(order.transactionFees) +
    toMoney(order.adSpendAllocated) +
    toMoney(order.otherCosts) +
    toMoney(order.packagingCost) +
    toMoney(order.codFee) +
    toMoney(order.rtoLoss) +
    toMoney(order.expenseAllocation)
  );
}

/**
 * Rank products by fully-loaded profit (descending). Ties break by
 * revenue descending, then key ascending, so output order is stable.
 */
export function rankProducts(orders: ProductIntelOrder[]): RankedProduct[] {
  const byKey = new Map<string, RankedProduct & { refundOrders: number }>();

  for (const order of orders ?? []) {
    if (order?.status === "cancelled") continue;
    const lines = order?.lineItems ?? [];
    if (lines.length === 0) continue;

    const nonCogs = orderNonCogsCosts(order);
    const totalLineRevenue = lines.reduce(
      (sum, li) => sum + toMoney(li.totalRevenue),
      0
    );

    // Allocate the order's non-COGS costs to its lines (see header).
    const allocated: number[] = new Array<number>(lines.length).fill(0);
    if (nonCogs !== 0 && lines.length > 0) {
      if (totalLineRevenue > 0) {
        let allocatedSoFar = 0;
        for (let i = 0; i < lines.length; i++) {
          if (i === lines.length - 1) {
            allocated[i] = round(nonCogs - allocatedSoFar);
          } else {
            const share =
              nonCogs * (toMoney(lines[i].totalRevenue) / totalLineRevenue);
            allocated[i] = round(share);
            allocatedSoFar += allocated[i];
          }
        }
      } else {
        // No revenue to weight by: split equally, remainder to last line.
        const each = round(nonCogs / lines.length);
        for (let i = 0; i < lines.length; i++) {
          allocated[i] =
            i === lines.length - 1
              ? round(nonCogs - each * (lines.length - 1))
              : each;
        }
      }
    }

    const hasRefund = toMoney(order.refundAmount) > 0;
    // Aggregate per product within this order first, so an order with
    // two lines of the same product still counts as one order for it.
    const perOrder = new Map<
      string,
      {
        line: ProductIntelLineItem;
        units: number;
        revenue: number;
        cogs: number;
        allocated: number;
      }
    >();
    lines.forEach((li, i) => {
      const key = productKey(li);
      let agg = perOrder.get(key);
      if (!agg) {
        agg = { line: li, units: 0, revenue: 0, cogs: 0, allocated: 0 };
        perOrder.set(key, agg);
      }
      agg.units += toMoney(li.quantity);
      agg.revenue += toMoney(li.totalRevenue);
      agg.cogs += toMoney(li.totalCogs);
      agg.allocated += allocated[i];
    });
    for (const [key, agg] of perOrder) {
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          productId: agg.line.productId || undefined,
          sku: agg.line.sku || undefined,
          name:
            agg.line.name ||
            agg.line.sku ||
            agg.line.productId ||
            "unknown",
          units: 0,
          ordersCount: 0,
          revenue: 0,
          cogs: 0,
          directProfit: 0,
          directMargin: 0,
          allocatedCosts: 0,
          fullyLoadedProfit: 0,
          fullyLoadedMargin: 0,
          avgPrice: 0,
          avgCogsPerUnit: 0,
          refundOrderShare: 0,
          refundOrders: 0,
        };
        byKey.set(key, row);
      }
      row.units += agg.units;
      row.ordersCount += 1;
      row.revenue += agg.revenue;
      row.cogs += agg.cogs;
      row.allocatedCosts += agg.allocated;
      if (hasRefund) row.refundOrders += 1;
    }
  }

  const rows: RankedProduct[] = [];
  for (const row of byKey.values()) {
    const revenue = round(row.revenue);
    const cogs = round(row.cogs);
    const allocatedCosts = round(row.allocatedCosts);
    const directProfit = round(revenue - cogs);
    const fullyLoadedProfit = round(revenue - cogs - allocatedCosts);
    rows.push({
      key: row.key,
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      units: row.units,
      ordersCount: row.ordersCount,
      revenue,
      cogs,
      directProfit,
      directMargin: revenue > 0 ? round((directProfit / revenue) * 100) : 0,
      allocatedCosts,
      fullyLoadedProfit,
      fullyLoadedMargin:
        revenue > 0 ? round((fullyLoadedProfit / revenue) * 100) : 0,
      avgPrice: row.units > 0 ? round(revenue / row.units) : 0,
      avgCogsPerUnit: row.units > 0 ? round(cogs / row.units) : 0,
      refundOrderShare:
        row.ordersCount > 0 ? round(row.refundOrders / row.ordersCount, 4) : 0,
    });
  }

  rows.sort(
    (a, b) =>
      b.fullyLoadedProfit - a.fullyLoadedProfit ||
      b.revenue - a.revenue ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
  return rows;
}

// ─── breakEvenForProduct ──────────────────────────────────────────────────

export interface BreakEvenStats {
  avgCogsPerUnit: number;
  avgShippingPerUnit: number;
  avgFeesPerUnit: number;
  avgAdSpendPerUnit: number;
  avgOtherPerUnit: number;
  avgPrice: number;
}

export interface BreakEvenResult {
  /** Sum of all per-unit costs; the price at which one unit breaks even. */
  unitCost: number;
  breakEvenPrice: number;
  /** Price required to earn targetMargin on the selling price. */
  priceForMargin: number;
  /**
   * Headroom below the current average price, as a fraction: 0.25 means
   * the price could fall 25% before hitting break-even. 0 when the
   * average price is at or below break-even (or when avgPrice is 0).
   */
  maxDiscountPct: number;
}

/**
 * Unit economics for one product. targetMargin is a fraction of the
 * selling price and must satisfy 0 <= targetMargin < 0.95; anything
 * else (including NaN) throws a clear Error.
 */
export function breakEvenForProduct(
  stats: BreakEvenStats,
  targetMargin: number
): BreakEvenResult {
  if (
    typeof targetMargin !== "number" ||
    !Number.isFinite(targetMargin) ||
    targetMargin < 0 ||
    targetMargin >= 0.95
  ) {
    throw new Error(
      `targetMargin must be in [0, 0.95), got ${String(targetMargin)}`
    );
  }
  const unitCost = round(
    toMoney(stats.avgCogsPerUnit) +
      toMoney(stats.avgShippingPerUnit) +
      toMoney(stats.avgFeesPerUnit) +
      toMoney(stats.avgAdSpendPerUnit) +
      toMoney(stats.avgOtherPerUnit)
  );
  const avgPrice = toMoney(stats.avgPrice);
  return {
    unitCost,
    breakEvenPrice: unitCost,
    priceForMargin: round(unitCost / (1 - targetMargin)),
    maxDiscountPct:
      avgPrice > 0
        ? Math.max(0, round((avgPrice - unitCost) / avgPrice, 4))
        : 0,
  };
}

// ─── productMovers ────────────────────────────────────────────────────────

export type ProductTrend = "new" | "dead" | "rising" | "falling" | "stable";

export interface ProductMover {
  key: string;
  productId?: string;
  sku?: string;
  name: string;
  recentUnits: number;
  priorUnits: number;
  /** Percent change vs prior window (20 = +20%). Null for new products. */
  pctChange: number | null;
  trend: ProductTrend;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Units in the recent window vs the equal-length prior window.
 * recent = [now − recentDays, now], prior = [now − 2 × recentDays,
 * now − recentDays). Sorted by recent units descending, then key
 * ascending. Invalid recentDays falls back to 30.
 */
export function productMovers(
  orders: ProductIntelOrder[],
  recentDays = 30,
  now: Date = new Date()
): ProductMover[] {
  const days =
    Number.isFinite(recentDays) && recentDays > 0 ? Math.floor(recentDays) : 30;
  const nowMs = toDate(now)?.getTime() ?? Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const recentStart = nowMs - days * msPerDay;
  const priorStart = nowMs - 2 * days * msPerDay;

  const byKey = new Map<string, ProductMover & { name: string }>();
  for (const order of orders ?? []) {
    if (order?.status === "cancelled") continue;
    const date = toDate(order?.orderDate);
    if (!date) continue;
    const t = date.getTime();
    const window: "recent" | "prior" | null =
      t >= recentStart && t <= nowMs
        ? "recent"
        : t >= priorStart && t < recentStart
          ? "prior"
          : null;
    if (!window) continue;
    for (const li of order.lineItems ?? []) {
      const key = productKey(li);
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          productId: li.productId || undefined,
          sku: li.sku || undefined,
          name: li.name || li.sku || li.productId || "unknown",
          recentUnits: 0,
          priorUnits: 0,
          pctChange: null,
          trend: "stable",
        };
        byKey.set(key, row);
      }
      if (window === "recent") row.recentUnits += toMoney(li.quantity);
      else row.priorUnits += toMoney(li.quantity);
    }
  }

  const rows: ProductMover[] = [];
  for (const row of byKey.values()) {
    if (row.recentUnits === 0 && row.priorUnits === 0) continue;
    let pctChange: number | null;
    let trend: ProductTrend;
    if (row.priorUnits === 0) {
      pctChange = null;
      trend = "new";
    } else if (row.recentUnits === 0) {
      pctChange = round(((0 - row.priorUnits) / row.priorUnits) * 100);
      trend = "dead";
    } else {
      pctChange = round(((row.recentUnits - row.priorUnits) / row.priorUnits) * 100);
      trend =
        pctChange >= 20
          ? "rising"
          : pctChange <= -20
            ? "falling"
            : "stable";
    }
    rows.push({
      key: row.key,
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      recentUnits: row.recentUnits,
      priorUnits: row.priorUnits,
      pctChange,
      trend,
    });
  }

  rows.sort(
    (a, b) =>
      b.recentUnits - a.recentUnits ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
  return rows;
}
