import "./setup-env";
import { describe, it, expect } from "vitest";
import { sumSyncedAdSpendRows } from "@/lib/ad-spend";

// Rates table: units of currency per 1 USD (same shape as
// getFxRates("USD").rates). PKR 278.5/USD, EUR 0.92/USD.
const rates = { USD: 1, EUR: 0.92, PKR: 278.5 };

describe("sumSyncedAdSpendRows (F5/F7 shared helper)", () => {
  it("sums same-currency rows with no conversion", () => {
    const out = sumSyncedAdSpendRows(
      [
        { spend: 100, currency: "USD", platform: "meta", date: new Date("2026-11-01") },
        { spend: 50.5, currency: "USD", platform: "google", date: new Date("2026-11-01") },
      ],
      "USD",
      rates
    );
    expect(out.total).toBe(150.5);
    expect(out.byPlatform).toEqual({ meta: 100, google: 50.5 });
    expect(out.byDay).toEqual({ "2026-11-01": 150.5 });
  });

  it("converts each row from its own currency into base before summing", () => {
    const out = sumSyncedAdSpendRows(
      [
        // 278.5 PKR = $1; 92 EUR = $100
        { spend: 278.5, currency: "PKR", platform: "meta", date: new Date("2026-11-01") },
        { spend: 92, currency: "EUR", platform: "google", date: new Date("2026-11-02") },
      ],
      "USD",
      rates
    );
    expect(out.total).toBe(101);
    expect(out.byPlatform).toEqual({ meta: 1, google: 100 });
    expect(out.byDay).toEqual({ "2026-11-01": 1, "2026-11-02": 100 });
  });

  it("converts into a non-USD base currency", () => {
    // Base PKR: $10 USD = 2785 PKR; 92 EUR = $100 = 27850 PKR
    const out = sumSyncedAdSpendRows(
      [
        { spend: 10, currency: "USD", platform: "meta", date: new Date("2026-11-01") },
        { spend: 92, currency: "EUR", platform: "meta", date: new Date("2026-11-01") },
      ],
      "PKR",
      rates
    );
    expect(out.total).toBe(30635);
    expect(out.byDay).toEqual({ "2026-11-01": 30635 });
  });

  it("sums unconverted when rates are null (fail-open, dashboard convention)", () => {
    const out = sumSyncedAdSpendRows(
      [{ spend: 100, currency: "PKR", platform: "meta", date: new Date("2026-11-01") }],
      "USD",
      null
    );
    expect(out.total).toBe(100);
  });

  it("throws on an unknown currency instead of silently mis-summing", () => {
    expect(() =>
      sumSyncedAdSpendRows(
        [{ spend: 100, currency: "XXX", platform: "meta", date: new Date("2026-11-01") }],
        "USD",
        rates
      )
    ).toThrow(/XXX/);
  });

  it("returns zeros for an empty row set", () => {
    const out = sumSyncedAdSpendRows([], "USD", rates);
    expect(out).toEqual({ total: 0, byPlatform: {}, byDay: {} });
  });

  it("treats missing currency as base currency and non-finite spend as 0", () => {
    const out = sumSyncedAdSpendRows(
      [
        { spend: 25, platform: "meta", date: new Date("2026-11-01") },
        { spend: Number.NaN, currency: "USD", platform: "meta", date: new Date("2026-11-01") },
      ],
      "USD",
      rates
    );
    expect(out.total).toBe(25);
  });

  it("groups string dates by their YYYY-MM-DD prefix", () => {
    const out = sumSyncedAdSpendRows(
      [{ spend: 7, currency: "USD", platform: "tiktok", date: "2026-11-03T10:00:00.000Z" }],
      "USD",
      rates
    );
    expect(out.byDay).toEqual({ "2026-11-03": 7 });
  });
});
