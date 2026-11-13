/**
 * Other-fee rules — pure matching + computation.
 *
 * Currency contract: order `grossRevenue` is expected ALREADY
 * converted into the report base currency (as loadReportOrders and
 * P&L's per-order conversion provide). A `percent` fee is a share of
 * that base-currency order value, so it needs no conversion. A
 * `fixed_per_order` fee is denominated in the RULE's currency and is
 * converted into the base with `rates` (fail-open: a rule whose
 * currency cannot be converted passes through 1:1 rather than
 * dropping the fee — same rule as convertAmount).
 *
 * A rule applies to an order only when ALL of these hold:
 * - the order is not cancelled;
 * - the order date falls inside [effectiveFrom, effectiveTo)
 *   (effectiveTo null = open-ended; the end is exclusive, matching
 *   the model docstring "before effectiveTo");
 * - `country`, when set, equals the order's shipping country
 *   (case-insensitive; orders carry the ISO code Shopify stored,
 *   e.g. "PK" — a full name such as "Pakistan" never matches);
 * - `paymentMethod`, when set, equals the order's payment method
 *   (case-insensitive);
 * - `productTag`, when set, equals a tag on one of the order's line
 *   items. NOTE: no order or product in this codebase carries tags
 *   today, so a rule with a productTag currently matches no orders.
 *   The check reads `lineItem.tags` when present so it starts
 *   working the moment tags are stored, instead of silently
 *   matching by product name (a different semantic).
 */
import { convertCurrency, round, toMoney } from "@/lib/profit-engine";

export interface OtherFeeRuleInput {
  kind: "percent" | "fixed_per_order";
  value: number;
  /** Currency the fixed fee is denominated in. Null/undefined = the
   *  report base currency (legacy rules saved before the field). */
  currency?: string | null;
  country?: string | null;
  productTag?: string | null;
  paymentMethod?: string | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
}

export interface OtherFeeOrderInput {
  /** Order value in the REPORT BASE currency (already converted). */
  grossRevenue: number;
  shippingCountry?: string | null;
  paymentMethod?: string | null;
  orderDate: Date | string;
  status?: string;
  lineItems?: { tags?: string[] | null }[];
}

export interface ComputeOtherFeesOptions {
  baseCurrency: string;
  /** Base-based FX rates table (as returned by getFxRates(base)). */
  rates?: Record<string, number> | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function ruleMatchesOrder(
  rule: OtherFeeRuleInput,
  order: OtherFeeOrderInput,
): boolean {
  if ((order.status ?? "fulfilled") === "cancelled") return false;
  const d = new Date(order.orderDate);
  if (Number.isNaN(d.getTime())) return false;
  const from = new Date(rule.effectiveFrom);
  if (Number.isNaN(from.getTime()) || d < from) return false;
  if (rule.effectiveTo) {
    const to = new Date(rule.effectiveTo);
    if (!Number.isNaN(to.getTime()) && d >= to) return false;
  }
  if (rule.country && norm(order.shippingCountry) !== norm(rule.country)) return false;
  if (rule.paymentMethod && norm(order.paymentMethod) !== norm(rule.paymentMethod)) return false;
  if (rule.productTag) {
    const tag = norm(rule.productTag);
    const hasTag = (order.lineItems ?? []).some((li) =>
      (li.tags ?? []).some((t) => norm(t) === tag),
    );
    if (!hasTag) return false;
  }
  return true;
}

/** Fee for ONE order, in the report base currency. 0 when no match. */
export function feeForOrder(
  rule: OtherFeeRuleInput,
  order: OtherFeeOrderInput,
  opts: ComputeOtherFeesOptions,
): number {
  if (!ruleMatchesOrder(rule, order)) return 0;
  const value = toMoney(rule.value);
  if (value <= 0) return 0;
  if (rule.kind === "percent") {
    return round((toMoney(order.grossRevenue) * value) / 100);
  }
  const from = (rule.currency ?? opts.baseCurrency).toUpperCase().trim();
  const base = opts.baseCurrency.toUpperCase().trim();
  if (!opts.rates || from === base) return round(value);
  try {
    return convertCurrency(value, from, base, opts.rates);
  } catch {
    return round(value);
  }
}

export interface OtherFeesResult {
  /** Total fee across all rules and orders, base currency. */
  total: number;
  /** Fee per rule, in the same order as `rules`. */
  perRule: number[];
  /** Fee per order, aligned with `orders`. */
  perOrder: number[];
}

/** Total fee for a set of rules over a set of (base-converted) orders. */
export function computeOtherFees(
  rules: OtherFeeRuleInput[],
  orders: OtherFeeOrderInput[],
  opts: ComputeOtherFeesOptions,
): OtherFeesResult {
  const perRule = rules.map(() => 0);
  const perOrder = orders.map(() => 0);
  let total = 0;
  for (let i = 0; i < rules.length; i++) {
    for (let j = 0; j < orders.length; j++) {
      const fee = feeForOrder(rules[i], orders[j], opts);
      if (fee === 0) continue;
      perRule[i] = round(perRule[i] + fee);
      perOrder[j] = round(perOrder[j] + fee);
      total = round(total + fee);
    }
  }
  return { total, perRule, perOrder };
}
