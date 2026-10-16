/**
 * analytics.test.ts — Phase 9.
 * Unit tests for the pure statistical helpers in @/lib/analytics.
 */
import { describe, it, expect } from "vitest";
import {
  detectAnomalies,
  forecastSeries,
  buildCohorts,
  type DailyPoint,
} from "@/lib/analytics";

function flatSeries(days: number, value: number, start = "2026-01-01"): DailyPoint[] {
  const out: DailyPoint[] = [];
  const d = new Date(start + "T00:00:00Z");
  for (let i = 0; i < days; i++) {
    const dt = new Date(d);
    dt.setUTCDate(dt.getUTCDate() + i);
    // deterministic wiggle so std > 0
    out.push({ date: dt.toISOString().slice(0, 10), value: value + ((i * 37) % 5) - 2 });
  }
  return out;
}

describe("detectAnomalies", () => {
  it("returns nothing for a stable series", () => {
    const s = flatSeries(60, 100);
    expect(detectAnomalies(s)).toHaveLength(0);
  });

  it("flags a large spike as critical", () => {
    const s = flatSeries(60, 100);
    s[59] = { ...s[59], value: 500 }; // 5x spike on the last day
    const anomalies = detectAnomalies(s);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].direction).toBe("spike");
    expect(anomalies[0].severity).toBe("critical");
    expect(anomalies[0].zScore).toBeGreaterThan(3.5);
    expect(anomalies[0].date).toBe(s[59].date);
  });

  it("flags a sharp drop as a warning or worse", () => {
    const s = flatSeries(60, 100);
    s[50] = { ...s[50], value: 10 };
    const anomalies = detectAnomalies(s);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].direction).toBe("drop");
  });

  it("never flags inside the warmup window", () => {
    const s = flatSeries(60, 100);
    s[5] = { ...s[5], value: 9999 }; // inside the 28-day window
    const anomalies = detectAnomalies(s, { window: 28 });
    expect(anomalies.every((a) => a.date !== s[5].date)).toBe(true);
  });

  it("handles empty and tiny series without throwing", () => {
    expect(detectAnomalies([])).toEqual([]);
    expect(detectAnomalies(flatSeries(5, 10))).toEqual([]);
  });

  it("is robust to NaN/Infinity inputs", () => {
    const s = flatSeries(60, 100);
    s[40] = { ...s[40], value: NaN };
    s[41] = { ...s[41], value: Infinity };
    expect(() => detectAnomalies(s)).not.toThrow();
  });
});

describe("forecastSeries", () => {
  it("projects an upward trend forward", () => {
    const s: DailyPoint[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      value: 100 + i * 10,
    }));
    const f = forecastSeries(s, 7);
    expect(f).toHaveLength(7);
    // strictly increasing forecasts for a clean upward trend
    for (let i = 1; i < f.length; i++) {
      expect(f[i].forecast).toBeGreaterThan(f[i - 1].forecast);
    }
    // bands contain the point forecast
    for (const p of f) {
      expect(p.lower).toBeLessThanOrEqual(p.forecast);
      expect(p.upper).toBeGreaterThanOrEqual(p.forecast);
    }
  });

  it("returns flat forecasts for a flat series", () => {
    const s = flatSeries(30, 200);
    const f = forecastSeries(s, 3);
    expect(f).toHaveLength(3);
    for (const p of f) {
      expect(Math.abs(p.forecast - 200)).toBeLessThan(5);
    }
  });

  it("clamps negative forecasts at zero by default", () => {
    const s: DailyPoint[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-02-${String(i + 1).padStart(2, "0")}`,
      value: 100 - i * 10, // steep decline
    }));
    const f = forecastSeries(s, 14);
    for (const p of f) {
      expect(p.forecast).toBeGreaterThanOrEqual(0);
      expect(p.lower).toBeGreaterThanOrEqual(0);
    }
  });

  it("dates continue sequentially after the last point", () => {
    const s = flatSeries(10, 50, "2026-03-01");
    const f = forecastSeries(s, 2);
    expect(f[0].date).toBe("2026-03-11");
    expect(f[1].date).toBe("2026-03-12");
  });

  it("returns [] for an empty series and clamps horizon", () => {
    expect(forecastSeries([], 7)).toEqual([]);
    expect(forecastSeries(flatSeries(10, 5), 500)).toHaveLength(90);
  });
});

describe("buildCohorts", () => {
  it("groups customers by first-order month with repeat rates", () => {
    const orders = [
      { orderDate: "2026-01-05T00:00:00Z", customerId: "a", netRevenue: 100 },
      { orderDate: "2026-01-10T00:00:00Z", customerId: "b", netRevenue: 50 },
      { orderDate: "2026-02-05T00:00:00Z", customerId: "a", netRevenue: 120 }, // repeat
      { orderDate: "2026-02-01T00:00:00Z", customerId: "c", netRevenue: 75 },
    ];
    const cohorts = buildCohorts(orders);
    expect(cohorts).toHaveLength(2);
    expect(cohorts[0].cohort).toBe("2026-01");
    expect(cohorts[0].customers).toBe(2);
    expect(cohorts[0].orders).toBe(3); // a's Feb order belongs to Jan cohort
    expect(cohorts[0].revenue).toBe(270);
    expect(cohorts[0].repeatCustomers).toBe(1);
    expect(cohorts[0].repeatRate).toBe(0.5);
    expect(cohorts[1].cohort).toBe("2026-02");
    expect(cohorts[1].repeatRate).toBe(0);
  });

  it("returns [] for no orders", () => {
    expect(buildCohorts([])).toEqual([]);
  });
});
