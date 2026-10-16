/**
 * analytics.ts — pure statistical building blocks for Phase 9 features.
 *
 * All functions are deterministic, side-effect free, and operate on plain
 * data so they are trivially testable. Money values are plain numbers
 * (already rounded by the profit engine); these helpers never divide by
 * zero and sanitize non-finite inputs.
 *
 * - detectAnomalies: z-score spike/drop detection on a daily series
 * - forecastSeries:  damped-trend linear forecast with confidence bands
 * - buildCohorts:    monthly order cohorts with revenue and repeat metrics
 */

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface Anomaly {
  date: string;
  value: number;
  expected: number;
  zScore: number;
  direction: "spike" | "drop";
  severity: "warning" | "critical";
}

export interface ForecastPoint {
  date: string;
  forecast: number;
  lower: number;
  upper: number;
}

export interface CohortRow {
  cohort: string; // YYYY-MM
  orders: number;
  customers: number;
  revenue: number;
  repeatCustomers: number;
  repeatRate: number; // 0..1
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + finite(b), 0) / xs.length;
}

function std(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, b) => a + (finite(b) - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(Math.max(v, 0));
}

/**
 * Z-score anomaly detection.
 *
 * Each point is compared against the trailing `window` days (excluding
 * itself). A point is an anomaly when |z| >= threshold. Severity is
 * "critical" at |z| >= criticalThreshold.
 *
 * Requires at least `window` points of history before a point can be
 * flagged, so the first `window` points never produce anomalies.
 */
export function detectAnomalies(
  series: DailyPoint[],
  opts: { window?: number; threshold?: number; criticalThreshold?: number } = {}
): Anomaly[] {
  const window = Math.max(7, Math.min(90, Math.floor(opts.window ?? 28)));
  const threshold = opts.threshold ?? 2.5;
  const criticalThreshold = opts.criticalThreshold ?? 3.5;

  const out: Anomaly[] = [];
  const values = series.map((p) => finite(p.value));

  for (let i = window; i < series.length; i++) {
    const baseline = values.slice(i - window, i);
    const m = mean(baseline);
    const s = std(baseline, m);
    if (s === 0) continue; // flat baseline — nothing anomalous about it

    const v = values[i];
    const z = (v - m) / s;
    if (Math.abs(z) >= threshold) {
      const rounded = Math.round(z * 100) / 100;
      out.push({
        date: series[i].date,
        value: v,
        expected: Math.round(m * 100) / 100,
        zScore: rounded,
        direction: z > 0 ? "spike" : "drop",
        severity: Math.abs(z) >= criticalThreshold ? "critical" : "warning",
      });
    }
  }
  return out;
}

/**
 * Damped-trend linear forecast.
 *
 * Fits an OLS line to the series, damps the slope by `damping` (0..1) so
 * long horizons regress toward the mean level, and derives confidence
 * bands from the residual standard error scaled by sqrt(horizon).
 * Forecasts are clamped at zero for revenue-like series.
 */
export function forecastSeries(
  series: DailyPoint[],
  horizonDays: number,
  opts: { damping?: number; clampZero?: boolean } = {}
): ForecastPoint[] {
  const horizon = Math.max(1, Math.min(90, Math.floor(horizonDays)));
  const damping = Math.min(1, Math.max(0, opts.damping ?? 0.85));
  const clampZero = opts.clampZero ?? true;

  const values = series.map((p) => finite(p.value));
  const n = values.length;
  if (n === 0) return [];

  // OLS: y = a + b*x
  let b = 0;
  const a = mean(values);
  if (n >= 2) {
    const xs = values.map((_, i) => i);
    const xMean = mean(xs);
    const num = xs.reduce((acc, x, i) => acc + (x - xMean) * (values[i] - a), 0);
    const den = xs.reduce((acc, x) => acc + (x - xMean) ** 2, 0);
    b = den === 0 ? 0 : num / den;
  }

  // Residual standard error
  const residuals = values.map((v, i) => v - (a + b * i));
  const se = std(residuals, mean(residuals));

  const lastDate = series[n - 1].date;
  const out: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    // Damped trend: last fitted level + slope * (damping + damping^2 + ... + damping^h)
    let trendSum = 0;
    for (let k = 1; k <= h; k++) trendSum += Math.pow(damping, k);
    const lastFitted = a + b * (n - 1);
    const f = lastFitted + b * trendSum;
    const band = 1.96 * se * Math.sqrt(h);
    const clamp = (x: number) => (clampZero ? Math.max(0, x) : x);
    const r2 = (x: number) => Math.round(clamp(x) * 100) / 100;
    out.push({
      date: addDays(lastDate, h),
      forecast: r2(f),
      lower: r2(f - band),
      upper: r2(f + band),
    });
  }
  return out;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface CohortOrder {
  orderDate: string; // ISO
  customerId: string;
  netRevenue: number;
}

/**
 * Monthly cohorts keyed by the customer's FIRST order month.
 * repeatCustomers counts customers with >1 order in the dataset.
 */
export function buildCohorts(orders: CohortOrder[]): CohortRow[] {
  const firstSeen = new Map<string, string>(); // customerId -> YYYY-MM
  for (const o of orders) {
    const m = o.orderDate.slice(0, 7);
    const prev = firstSeen.get(o.customerId);
    if (!prev || m < prev) firstSeen.set(o.customerId, m);
  }

  const byCohort = new Map<string, {
    orders: number; customers: Set<string>; revenue: number;
    orderCount: Map<string, number>;
  }>();

  for (const o of orders) {
    const cohort = firstSeen.get(o.customerId);
    if (!cohort) continue;
    let row = byCohort.get(cohort);
    if (!row) {
      row = { orders: 0, customers: new Set(), revenue: 0, orderCount: new Map() };
      byCohort.set(cohort, row);
    }
    row.orders++;
    row.customers.add(o.customerId);
    row.revenue = row.revenue + finite(o.netRevenue);
    row.orderCount.set(o.customerId, (row.orderCount.get(o.customerId) ?? 0) + 1);
  }

  return [...byCohort.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([cohort, row]) => {
      const repeatCustomers = [...row.orderCount.values()].filter((c) => c > 1).length;
      const customers = row.customers.size;
      return {
        cohort,
        orders: row.orders,
        customers,
        revenue: Math.round(row.revenue * 100) / 100,
        repeatCustomers,
        repeatRate: customers === 0 ? 0 : Math.round((repeatCustomers / customers) * 1000) / 1000,
      };
    });
}
