/**
 * Per-product aggregates computed from orders at READ time — pure
 * functions, no DB, no network.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * `Product` carries stored aggregate fields (`totalRevenue`,
 * `totalOrders`, `totalCogs`, `totalProfit`, `avgProfitMargin`) whose
 * model comment says they are "recomputed on sync" — but nothing on
 * this main ever writes them: the only `ProductModel.create` zeroes
 * them, the Shopify webhook only sets name/isActive, and sync only
 * reads products. So every product displayed Revenue 0 / Profit 0 /
 * 0.0% margin / 0 orders, and COGS Hub's "Apply % of avg price" —
 * which divided the stored zeros — PATCHed `{ defaultCogs: 0 }` onto
 * every shown product, wiping merchant-entered COGS.
 *
 * The fix is to compute the aggregates from order line items whenever
 * products are read, instead of trusting the stored fields. No
 * migration, no writes on sync; the numbers are always live. The
 * stored fields stay in the model as a fallback but are no longer
 * read for display.
 *
 * ─── MATCHING KEY ─────────────────────────────────────────────────────────
 * An order line item references its product by `productId` (the
 * Shopify `product_id`, written by `src/lib/sync/shopify.ts`), falling
 * back to `sku`, then `name` — the same precedence product-intel
 * uses (`productKey` in `src/lib/product-intel.ts`). A `Product` doc
 * carries the Shopify id as `externalId`, so the join is:
 * `externalId` → `sku` → `name`, in that order, via
 * `lookupProductAggregate`. Manual/CSV orders usually have no
 * `productId`, so they aggregate under their sku/name instead.
 *
 * ─── CONVENTIONS (same as product-intel) ────────────────────────────────
 * - Cancelled orders are excluded. Refunded orders are kept (their
 *   recorded line revenues stand).
 * - An order with two lines of the same product counts as ONE order
 *   for it (`totalOrders` counts orders, not lines).
 * - Line revenue is `totalRevenue` when stored, else `price ×
 *   quantity`; line COGS is `totalCogs` when stored, else
 *   `cogs × quantity`. Non-finite inputs coerce to 0 via `toMoney`.
 * - `totalProfit = totalRevenue − totalCogs` (line COGS only — no
 *   shipping/fees/ad-spend allocation; that is product-intel's job).
 * - `avgProfitMargin = totalProfit / totalRevenue × 100`, 0 when
 *   revenue is 0. `avgPrice = totalRevenue / totalOrders` — revenue
 *   per order containing the product, the definition COGS Hub's own
 *   copy states ("Average price is total revenue divided by total
 *   orders for that product"). 0 when there are no orders.
 * - All money outputs are rounded to 2dp; margins are 2dp percentages.
 * - Amounts are summed AS GIVEN: callers must convert each order's
 *   line amounts into one base currency BEFORE calling
 *   `computeProductAggregates` (see `src/lib/product-aggregates-server.ts`,
 *   which converts per order exactly like `product-intel-server.ts`
 *   does). Summing mixed currencies 1:1 would repeat the LTV bug.
 */

import { convertCurrency, round, toMoney } from "@/lib/profit-engine";

// ─── Input types ────────────────────────────────────────────────────────────

export interface AggregateOrderLineItem {
  productId?: string;
  sku?: string;
  name?: string;
  quantity?: number;
  price?: number;
  cogs?: number;
  totalRevenue?: number;
  totalCogs?: number;
}

export interface AggregateOrder {
  status?: string;
  lineItems?: AggregateOrderLineItem[];
}

// ─── Output types ───────────────────────────────────────────────────────────

export interface ProductAggregate {
  key: string;
  productId?: string;
  sku?: string;
  name: string;
  totalRevenue: number;
  totalOrders: number;
  totalCogs: number;
  totalProfit: number;
  avgProfitMargin: number;
  avgPrice: number;
}

/** The grouping key for one line item: productId, then sku, then name. */
export function productAggregateKey(line: AggregateOrderLineItem): string {
  return line.productId || line.sku || line.name || "unknown";
}

function lineRevenue(li: AggregateOrderLineItem): number {
  if (Number.isFinite(li.totalRevenue)) return toMoney(li.totalRevenue);
  return toMoney(li.price) * toMoney(li.quantity);
}

function lineCogs(li: AggregateOrderLineItem): number {
  if (Number.isFinite(li.totalCogs)) return toMoney(li.totalCogs);
  return toMoney(li.cogs) * toMoney(li.quantity);
}

/**
 * Aggregate per-product revenue / COGS / profit / orders from order
 * line items. Amounts must already be in ONE currency (the caller
 * converts per order first); see the header. Returns a map keyed by
 * `productAggregateKey`.
 */
export function computeProductAggregates(
  orders: AggregateOrder[] | null | undefined,
): Map<string, ProductAggregate> {
  const byKey = new Map<string, ProductAggregate>();

  for (const order of orders ?? []) {
    if (order?.status === "cancelled") continue;
    const lines = order?.lineItems ?? [];
    if (lines.length === 0) continue;

    // Aggregate per product within this order first, so an order with
    // two lines of the same product still counts as one order for it.
    const perOrder = new Map<
      string,
      { line: AggregateOrderLineItem; revenue: number; cogs: number }
    >();
    for (const li of lines) {
      const key = productAggregateKey(li);
      let agg = perOrder.get(key);
      if (!agg) {
        agg = { line: li, revenue: 0, cogs: 0 };
        perOrder.set(key, agg);
      }
      agg.revenue += lineRevenue(li);
      agg.cogs += lineCogs(li);
    }

    for (const [key, agg] of perOrder) {
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          productId: agg.line.productId || undefined,
          sku: agg.line.sku || undefined,
          name: agg.line.name || agg.line.sku || agg.line.productId || "unknown",
          totalRevenue: 0,
          totalOrders: 0,
          totalCogs: 0,
          totalProfit: 0,
          avgProfitMargin: 0,
          avgPrice: 0,
        };
        byKey.set(key, row);
      }
      row.totalRevenue += agg.revenue;
      row.totalCogs += agg.cogs;
      row.totalOrders += 1;
    }
  }

  for (const row of byKey.values()) {
    row.totalRevenue = round(row.totalRevenue);
    row.totalCogs = round(row.totalCogs);
    row.totalProfit = round(row.totalRevenue - row.totalCogs);
    row.avgProfitMargin =
      row.totalRevenue > 0 ? round((row.totalProfit / row.totalRevenue) * 100) : 0;
    row.avgPrice =
      row.totalOrders > 0 ? round(row.totalRevenue / row.totalOrders) : 0;
  }

  return byKey;
}

/**
 * Find the computed aggregate for one `Product` doc. Tries the doc's
 * `externalId` (the Shopify product id — the line items' `productId`),
 * then `sku`, then `name`, matching the key precedence of
 * `productAggregateKey`. Returns undefined when the product has no
 * orders yet.
 */
export function lookupProductAggregate(
  aggregates: Map<string, ProductAggregate>,
  product: { externalId?: string | null; sku?: string | null; name?: string | null },
): ProductAggregate | undefined {
  for (const key of [product.externalId, product.sku, product.name]) {
    if (!key) continue;
    const agg = aggregates.get(key);
    if (agg) return agg;
  }
  return undefined;
}

/** Zero aggregate for a product with no orders (never undefined). */
export function emptyProductAggregate(key: string, name: string): ProductAggregate {
  return {
    key,
    name,
    totalRevenue: 0,
    totalOrders: 0,
    totalCogs: 0,
    totalProfit: 0,
    avgProfitMargin: 0,
    avgPrice: 0,
  };
}

/**
 * Express a base-currency average price in a product's own currency,
 * for writing `defaultCogs` (which is stored in the product's own
 * currency, never in base).
 *
 * This is the second half of the COGS-wipe guard: the first half stops
 * Apply-% from writing 0 for a product with no orders; this half stops
 * it from writing a BASE-currency number into a FOREIGN-currency
 * product — e.g. a PKR avg price of 31,114 stored as USD COGS on a
 * $49.99 earbud. Conversion is linear, so converting the aggregate
 * equals aggregating converted lines (up to 2dp rounding).
 *
 * Returns `null` when the price cannot be expressed in the product's
 * currency — rates missing/empty, or an unknown currency code — so the
 * caller SKIPS the product instead of writing a wrong-currency value.
 * Deliberately does NOT fail open: `convertAmount`'s 1:1 fallback
 * would silently store a base-denominated number as product currency.
 * Same-currency is exact (no conversion needed, even for 0 — a zero
 * average still means "no orders" and is skipped downstream with the
 * no-price reason, not the FX reason).
 */
export function avgPriceInCurrency(
  avgPriceBase: number,
  baseCurrency: string,
  productCurrency: string | null | undefined,
  rates: Record<string, number> | null,
): number | null {
  const base = baseCurrency.toUpperCase().trim();
  const pc = (productCurrency ?? base).toUpperCase().trim();
  if (pc === base) return round(avgPriceBase);
  if (!rates || Object.keys(rates).length === 0) return null;
  try {
    return round(convertCurrency(avgPriceBase, base, pc, rates));
  } catch {
    return null;
  }
}

// ─── Bulk "Apply % of avg price" planning ───────────────────────────────────

/**
 * One row the bulk-apply acts on: a product with the average price
 * computed from its orders, expressed in the PRODUCT's own currency
 * (see `avgPriceInCurrency`) — because `defaultCogs` is stored in
 * the product's currency. `avgPrice: null` means the price could not
 * be expressed in the product's currency (FX rate unavailable) and
 * the row must be skipped, never written.
 */
export interface ApplyPercentRow {
  id: string;
  name: string;
  avgPrice: number | null;
}

export interface ApplyPercentPlan {
  /** PATCHes that are safe to send — never contains `defaultCogs: 0`. */
  updates: { id: string; defaultCogs: number }[];
  /** Rows deliberately NOT written, with the reason shown to the user. */
  skipped: { id: string; name: string; reason: string }[];
}

/**
 * Plan a bulk "Apply % of avg price as COGS" run.
 *
 * THE GUARD (this is the fix for the COGS wipe): a product whose
 * average price is zero, missing, or non-finite — i.e. a product with
 * no orders yet — is SKIPPED, never written as `defaultCogs: 0`.
 * Writing 0 would silently erase a merchant-entered COGS. The same
 * applies when the percentage itself is not a positive finite number,
 * or when the computed COGS rounds to 0. A `null` average price means
 * the price could not be expressed in the product's own currency (FX
 * rate unavailable — see `avgPriceInCurrency`); that row is skipped
 * too, because writing the base-currency number as product-currency
 * COGS would be wrong money. Callers must report `skipped` to the
 * user instead of a blanket success note.
 */
export function planBulkApplyPercent(
  rows: ApplyPercentRow[],
  pct: number,
): ApplyPercentPlan {
  const updates: ApplyPercentPlan["updates"] = [];
  const skipped: ApplyPercentPlan["skipped"] = [];

  if (!Number.isFinite(pct) || pct <= 0) {
    for (const r of rows) {
      skipped.push({
        id: r.id,
        name: r.name,
        reason: "percentage must be greater than 0",
      });
    }
    return { updates, skipped };
  }

  for (const r of rows) {
    if (r.avgPrice === null) {
      skipped.push({
        id: r.id,
        name: r.name,
        reason: "average price could not be converted into the product's currency (FX rate unavailable) — nothing was written",
      });
      continue;
    }
    if (!Number.isFinite(r.avgPrice) || r.avgPrice <= 0) {
      skipped.push({
        id: r.id,
        name: r.name,
        reason: "no average price yet (no orders) — nothing was written",
      });
      continue;
    }
    const next = round((r.avgPrice * pct) / 100);
    if (!Number.isFinite(next) || next <= 0) {
      skipped.push({
        id: r.id,
        name: r.name,
        reason: "computed COGS rounds to 0 — nothing was written",
      });
      continue;
    }
    updates.push({ id: r.id, defaultCogs: next });
  }

  return { updates, skipped };
}
