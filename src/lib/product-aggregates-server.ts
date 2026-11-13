/**
 * Server bridge for product aggregates (thin wrapper over the pure
 * module in `@/lib/product-aggregates`, per the product-intel
 * decision D6 pattern).
 *
 * Loads the team's non-cancelled orders, converts each order's line
 * amounts into the report base currency BEFORE summing (the same
 * per-order conversion rule as `product-intel-server.ts` — a
 * multi-currency team must never be aggregated on 1:1 mixed-currency
 * sums), then runs the pure `computeProductAggregates`.
 *
 * When FX rates are unavailable, `getReportRates` returns null and
 * orders pass through unconverted (fail-open, same as the other
 * report bridges) rather than failing the whole products list.
 */

import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { toObjectId } from "@/lib/validation";
import {
  convertAmount,
  getReportBaseCurrency,
  getReportRates,
} from "@/lib/report-currency";
import {
  computeProductAggregates,
  type AggregateOrder,
  type ProductAggregate,
} from "@/lib/product-aggregates";

export interface ComputedProductAggregates {
  /** The currency every aggregate amount is expressed in. */
  baseCurrency: string;
  /** The FX rates table the aggregates were converted with (USD-based map, or null when unavailable). Returned so callers can express an aggregate in another currency (e.g. a product's own currency for COGS writes) without re-fetching rates. */
  rates: Record<string, number> | null;
  /** Aggregates keyed by `productAggregateKey` (productId → sku → name). */
  aggregates: Map<string, ProductAggregate>;
}

export async function getComputedProductAggregates(
  teamId: string,
): Promise<ComputedProductAggregates> {
  await connectDB();

  const base = await getReportBaseCurrency(teamId);
  const rates = await getReportRates(base);

  const orders = await OrderModel.find({
    teamId: toObjectId(teamId),
    status: { $ne: "cancelled" },
  })
    .select("currency lineItems status")
    .lean();

  const inputs: AggregateOrder[] = orders.map((o) => {
    const from = ((o as { currency?: string }).currency ?? base).toUpperCase().trim();
    const conv = (v?: number | null) => convertAmount(v ?? 0, from, base, rates);
    return {
      status: o.status,
      lineItems: (o.lineItems ?? []).map(
        (li: {
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
        }),
      ),
    };
  });

  return { baseCurrency: base, rates, aggregates: computeProductAggregates(inputs) };
}
