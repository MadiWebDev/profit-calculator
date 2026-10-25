/**
 * Guardrail-alert evaluation (pure module).
 *
 * No DB, no network, no sending: the caller (server bridge) owns rule
 * persistence, dedup, and delivery. This module only answers, for each
 * rule, "what is the metric value over the window, and does it breach
 * the threshold?"
 *
 * Money and percentages are rounded to 2dp via `round`/`toMoney` from
 * `@/lib/profit-engine`; non-finite inputs coerce to 0, so a bad field
 * can never poison a result with NaN.
 *
 * Documented behaviours (see also the tests):
 * - Window: an order/shipment counts when its date falls in
 *   [now - windowDays, now] (inclusive on both ends).
 * - Cancelled orders are always excluded from every metric.
 * - profit_margin with zero total revenue in window: value is 0 and the
 *   rule does NOT trigger (there is no margin to judge).
 * - avg_order_profit with no orders in window: value is 0 and the rule
 *   does NOT trigger.
 * - In general, a metric with no denominator data in window (no
 *   non-cancelled orders, or no in-window shipments when shipments were
 *   provided) reports value 0 and does NOT trigger, even for a "below"
 *   rule — an absent signal is not a breach.
 * - rto_rate: when the shipments array is non-empty, RTO rate comes
 *   from shipments (returned_rto / all in-window shipments). Only when
 *   no shipments are provided at all does it fall back to orders
 *   (orders with rtoLoss > 0 / all non-cancelled orders in window).
 *   A non-empty shipments array with nothing inside the window still
 *   uses the shipment path, so it reports 0 with no trigger rather
 *   than silently switching sources.
 * - Shipment date: `bookedAt` wins when present, otherwise `createdAt`.
 *   A shipment with neither (or with an unparseable date) is included
 *   unconditionally — undated shipments are assumed current rather
 *   than dropped, because dropping them would understate RTO rate.
 * - Trigger: "below" triggers only when value < threshold, "above"
 *   only when value > threshold; equality never triggers.
 * - Severity: when triggered and threshold > 0, "critical" when the
 *   breach is large (value <= threshold * 0.5 for "below", or
 *   value >= threshold * 1.5 for "above"); otherwise "warning".
 *   For thresholds <= 0, severity is always "warning" (the 0.5x/1.5x
 *   bands are meaningless at or below zero). Untriggered => null.
 */

import { round, toMoney } from "@/lib/profit-engine";

export type AlertMetric =
  | "profit_margin"
  | "refund_rate"
  | "rto_rate"
  | "avg_order_profit";

export type AlertOperator = "below" | "above";

export interface AlertRuleInput {
  id: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  windowDays: number;
}

export interface AlertEvaluation {
  ruleId: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  value: number;
  triggered: boolean;
  severity: "warning" | "critical" | null;
  message: string;
}

/** Minimal order shape the evaluator needs. Dates accept Date/string/number. */
export interface AlertOrderInput {
  orderDate: Date | string | number;
  grossRevenue: number;
  netProfit: number;
  refundAmount: number;
  rtoLoss: number;
  status: string;
}

/** Minimal shipment shape. Uses the courier status vocabulary. */
export interface AlertShipmentInput {
  status: string;
  bookedAt?: Date | string | number | null;
  createdAt?: Date | string | number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const METRIC_LABELS: Record<AlertMetric, string> = {
  profit_margin: "Profit margin",
  refund_rate: "Refund rate",
  rto_rate: "RTO rate",
  avg_order_profit: "Average order profit",
};

function isCancelled(status: string): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "cancelled" || s === "canceled";
}

function isRefunded(status: string): boolean {
  return String(status ?? "").trim().toLowerCase() === "refunded";
}

function parseDate(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function inWindow(dateMs: number | null, startMs: number, endMs: number): boolean {
  // A null date means "unknown", which the caller decides; here it is
  // only used for orders, where an unknown date cannot be placed in
  // the window and is therefore excluded.
  if (dateMs === null) return false;
  return dateMs >= startMs && dateMs <= endMs;
}

function windowBounds(windowDays: number, now: Date): { startMs: number; endMs: number } {
  const days = Math.max(0, toMoney(windowDays));
  const endMs = now.getTime();
  return { startMs: endMs - days * DAY_MS, endMs };
}

/** Strip trailing zeros for display: 20 -> "20", 12.5 -> "12.5". */
function displayNumber(n: number): string {
  const r = round(n, 2);
  return String(r);
}

function formatValue(metric: AlertMetric, value: number): string {
  const v = round(value, 2).toFixed(2);
  return metric === "avg_order_profit" ? v : `${v}%`;
}

function buildMessage(
  metric: AlertMetric,
  operator: AlertOperator,
  threshold: number,
  value: number,
  windowDays: number,
  triggered: boolean,
): string {
  const label = METRIC_LABELS[metric];
  const valueText = formatValue(metric, value);
  const thresholdText =
    metric === "avg_order_profit" ? displayNumber(threshold) : `${displayNumber(threshold)}%`;
  const days = Math.max(0, toMoney(windowDays));
  const daysText = Number.isInteger(days) ? String(days) : displayNumber(days);
  const relation = triggered ? operator : "within";
  return `${label} ${valueText} is ${relation} threshold ${thresholdText} over the last ${daysText} days`;
}

function severityFor(
  operator: AlertOperator,
  threshold: number,
  value: number,
): "warning" | "critical" {
  const t = toMoney(threshold);
  if (t <= 0) return "warning";
  if (operator === "below" && value <= t * 0.5) return "critical";
  if (operator === "above" && value >= t * 1.5) return "critical";
  return "warning";
}

/**
 * Bare metric value (2dp) over the window. Returns 0 when there is no
 * data to compute from (see the module header for the no-data rules).
 */
export function metricValue(
  metric: AlertMetric,
  orders: AlertOrderInput[],
  shipments: AlertShipmentInput[],
  windowDays: number,
  now: Date = new Date(),
): number {
  const { startMs, endMs } = windowBounds(windowDays, now);

  const liveOrders = (orders ?? []).filter(
    (o) => !isCancelled(o.status) && inWindow(parseDate(o.orderDate), startMs, endMs),
  );

  switch (metric) {
    case "profit_margin": {
      const revenue = liveOrders.reduce((sum, o) => sum + toMoney(o.grossRevenue), 0);
      if (revenue === 0) return 0;
      const profit = liveOrders.reduce((sum, o) => sum + toMoney(o.netProfit), 0);
      return round((profit / revenue) * 100, 2);
    }
    case "refund_rate": {
      if (liveOrders.length === 0) return 0;
      const refunded = liveOrders.filter(
        (o) => toMoney(o.refundAmount) > 0 || isRefunded(o.status),
      ).length;
      return round((refunded / liveOrders.length) * 100, 2);
    }
    case "rto_rate": {
      if ((shipments ?? []).length > 0) {
        const inWindowShipments = shipments.filter((s) => {
          const dateMs = parseDate(s.bookedAt ?? s.createdAt);
          // Undated shipments are included (see module header).
          return dateMs === null || (dateMs >= startMs && dateMs <= endMs);
        });
        if (inWindowShipments.length === 0) return 0;
        const rto = inWindowShipments.filter(
          (s) => String(s.status ?? "").trim().toLowerCase() === "returned_rto",
        ).length;
        return round((rto / inWindowShipments.length) * 100, 2);
      }
      if (liveOrders.length === 0) return 0;
      const rto = liveOrders.filter((o) => toMoney(o.rtoLoss) > 0).length;
      return round((rto / liveOrders.length) * 100, 2);
    }
    case "avg_order_profit": {
      if (liveOrders.length === 0) return 0;
      const profit = liveOrders.reduce((sum, o) => sum + toMoney(o.netProfit), 0);
      return round(profit / liveOrders.length, 2);
    }
  }
}

/** Whether the metric has any denominator data in the window. */
function hasData(
  metric: AlertMetric,
  orders: AlertOrderInput[],
  shipments: AlertShipmentInput[],
  windowDays: number,
  now: Date,
): boolean {
  const { startMs, endMs } = windowBounds(windowDays, now);
  const liveOrders = (orders ?? []).filter(
    (o) => !isCancelled(o.status) && inWindow(parseDate(o.orderDate), startMs, endMs),
  );
  switch (metric) {
    case "profit_margin": {
      // Margin needs revenue, not just orders: zero-revenue orders
      // carry no margin signal.
      return liveOrders.reduce((sum, o) => sum + toMoney(o.grossRevenue), 0) !== 0;
    }
    case "refund_rate":
    case "avg_order_profit":
      return liveOrders.length > 0;
    case "rto_rate": {
      if ((shipments ?? []).length > 0) {
        return shipments.some((s) => {
          const dateMs = parseDate(s.bookedAt ?? s.createdAt);
          return dateMs === null || (dateMs >= startMs && dateMs <= endMs);
        });
      }
      return liveOrders.length > 0;
    }
  }
}

/**
 * Evaluate every rule against the orders/shipments in its window.
 * Each rule has its own windowDays, so values are computed per rule.
 */
export function evaluateAlerts(
  rules: AlertRuleInput[],
  orders: AlertOrderInput[],
  shipments: AlertShipmentInput[],
  now: Date = new Date(),
): AlertEvaluation[] {
  return (rules ?? []).map((rule) => {
    const threshold = toMoney(rule.threshold);
    const value = metricValue(rule.metric, orders, shipments, rule.windowDays, now);
    const data = hasData(rule.metric, orders, shipments, rule.windowDays, now);
    const breached =
      data &&
      (rule.operator === "below" ? value < threshold : value > threshold);
    const triggered = breached;
    return {
      ruleId: rule.id,
      metric: rule.metric,
      operator: rule.operator,
      threshold,
      value,
      triggered,
      severity: triggered ? severityFor(rule.operator, threshold, value) : null,
      message: buildMessage(
        rule.metric,
        rule.operator,
        threshold,
        value,
        rule.windowDays,
        triggered,
      ),
    };
  });
}
