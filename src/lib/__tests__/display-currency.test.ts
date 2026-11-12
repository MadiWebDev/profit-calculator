/**
 * Display-currency helpers — pure logic for the live FX widget and the
 * display-currency switcher. No network, no database, no browser.
 */
import { describe, it, expect } from "vitest";
import {
  isValidCurrencyCode,
  resolveDisplayCurrency,
  mostCommonCurrency,
  formatRatesAsOf,
  parseFxRatesPayload,
  FX_FREE_PLAN_NOTE,
} from "@/lib/display-currency";
import { convertAmount } from "@/lib/report-currency";

// Same rates table the other FX tests use: 92 EUR = 100 USD, 79 GBP = 100 USD.
const RATES = { USD: 1, EUR: 0.92, GBP: 0.79, PKR: 278.5 };

describe("isValidCurrencyCode", () => {
  it("accepts 3-letter codes (case-insensitive) and rejects the rest", () => {
    expect(isValidCurrencyCode("USD")).toBe(true);
    expect(isValidCurrencyCode("eur")).toBe(true);
    expect(isValidCurrencyCode("US")).toBe(false);
    expect(isValidCurrencyCode("USDD")).toBe(false);
    expect(isValidCurrencyCode("U5D")).toBe(false);
    expect(isValidCurrencyCode("")).toBe(false);
    expect(isValidCurrencyCode(null)).toBe(false);
    expect(isValidCurrencyCode(undefined)).toBe(false);
    expect(isValidCurrencyCode(123)).toBe(false);
  });
});

describe("resolveDisplayCurrency", () => {
  it("prefers the saved workspace setting over everything else", () => {
    expect(
      resolveDisplayCurrency({ server: "EUR", stored: "PKR", reportingCurrency: "GBP" }),
    ).toBe("EUR");
  });

  it("falls back to the stored browser choice, then the reporting currency", () => {
    expect(resolveDisplayCurrency({ stored: "PKR", reportingCurrency: "GBP" })).toBe("PKR");
    expect(resolveDisplayCurrency({ reportingCurrency: "GBP" })).toBe("GBP");
  });

  it("defaults to USD when nothing usable is provided", () => {
    expect(resolveDisplayCurrency({})).toBe("USD");
    expect(resolveDisplayCurrency({ server: "bogus", stored: "", reportingCurrency: "12" })).toBe(
      "USD",
    );
  });

  it("normalizes lowercase codes and honours an explicit fallback", () => {
    expect(resolveDisplayCurrency({ server: "eur" })).toBe("EUR");
    expect(resolveDisplayCurrency({})).toBe("USD");
    expect(resolveDisplayCurrency({ fallback: "PKR" })).toBe("PKR");
  });

  it("prefers the saved USER preference over the team setting and everything else", () => {
    expect(
      resolveDisplayCurrency({
        user: "PKR",
        server: "EUR",
        stored: "GBP",
        geo: "JPY",
        reportingCurrency: "INR",
      }),
    ).toBe("PKR");
  });

  it("lets the team setting beat the browser choice and geo-detected currency", () => {
    expect(resolveDisplayCurrency({ server: "EUR", stored: "PKR", geo: "JPY" })).toBe("EUR");
  });

  it("lets the browser choice beat geo, and geo beat the reporting currency", () => {
    expect(resolveDisplayCurrency({ stored: "PKR", geo: "JPY", reportingCurrency: "GBP" })).toBe(
      "PKR",
    );
    expect(resolveDisplayCurrency({ geo: "JPY", reportingCurrency: "GBP" })).toBe("JPY");
    expect(resolveDisplayCurrency({ reportingCurrency: "GBP", geo: null })).toBe("GBP");
  });

  it("skips invalid codes in the new slots without crashing", () => {
    expect(
      resolveDisplayCurrency({ user: "bogus", server: "", stored: "12", geo: "XYZ1" }),
    ).toBe("USD");
    expect(resolveDisplayCurrency({ user: null, geo: "pkr" })).toBe("PKR");
  });
});

describe("mostCommonCurrency", () => {
  it("returns the most frequent store currency, USD when there is none", () => {
    expect(mostCommonCurrency(["USD", "PKR", "PKR", "EUR"])).toBe("PKR");
    expect(mostCommonCurrency([])).toBe("USD");
    expect(mostCommonCurrency([null, undefined, ""])).toBe("USD");
  });

  it("is case-insensitive and gives ties to the first currency seen", () => {
    expect(mostCommonCurrency(["usd", "EUR"])).toBe("USD");
    expect(mostCommonCurrency(["EUR", "usd"])).toBe("EUR");
  });
});

describe("formatRatesAsOf", () => {
  it("stamps a valid timestamp as HH:MM local time and never pretends", () => {
    expect(formatRatesAsOf("2026-11-11T14:32:00.000Z")).toMatch(/^Rates as of \d{2}:\d{2}$/);
  });

  it("says so plainly when there is no usable timestamp", () => {
    expect(formatRatesAsOf(null)).toBe("Rates unavailable");
    expect(formatRatesAsOf(undefined)).toBe("Rates unavailable");
    expect(formatRatesAsOf("not-a-date")).toBe("Rates unavailable");
    expect(formatRatesAsOf("")).toBe("Rates unavailable");
  });
});

describe("parseFxRatesPayload", () => {
  it("accepts a well-formed /api/fx/rates payload with its fetchedAt stamp", () => {
    const parsed = parseFxRatesPayload({
      base: "USD",
      rates: { EUR: 0.92, PKR: 278.5 },
      fetchedAt: "2026-11-11T14:32:00.000Z",
    });
    expect(parsed?.rates).toEqual({ EUR: 0.92, PKR: 278.5 });
    expect(parsed?.fetchedAt).toBe("2026-11-11T14:32:00.000Z");
  });

  it("keeps rates usable when fetchedAt is missing, and drops bad entries", () => {
    const parsed = parseFxRatesPayload({
      rates: { EUR: 0.92, BAD: "nope", ZERO: 0, NEG: -1, gbp: 0.79 },
    });
    expect(parsed?.rates).toEqual({ EUR: 0.92, GBP: 0.79 });
    expect(parsed?.fetchedAt).toBeNull();
  });

  it("rejects payloads with no usable rates table", () => {
    expect(parseFxRatesPayload(null)).toBeNull();
    expect(parseFxRatesPayload({})).toBeNull();
    expect(parseFxRatesPayload({ rates: {} })).toBeNull();
    expect(parseFxRatesPayload({ rates: { BAD: "nope" } })).toBeNull();
    expect(parseFxRatesPayload({ rates: "EUR" })).toBeNull();
    expect(parseFxRatesPayload([])).toBeNull();
  });
});

describe("widget conversion math (report-currency engine)", () => {
  it("converts the widget amount at the live rate", () => {
    // 100 USD -> EUR at 0.92, and back again.
    expect(convertAmount(100, "USD", "EUR", RATES)).toBe(92);
    expect(convertAmount(92, "EUR", "USD", RATES)).toBeCloseTo(100, 6);
    expect(convertAmount(100, "USD", "PKR", RATES)).toBe(27850);
  });

  it("is exact for same-currency and fail-open without rates or for unknown codes", () => {
    expect(convertAmount(100, "USD", "USD", RATES)).toBe(100);
    expect(convertAmount(100, "USD", "EUR", null)).toBe(100);
    expect(convertAmount(100, "XXX", "EUR", RATES)).toBe(100);
  });
});

describe("FX_FREE_PLAN_NOTE", () => {
  it("states the hourly free-plan limit and the paid-plan requirement", () => {
    expect(FX_FREE_PLAN_NOTE).toContain("hourly");
    expect(FX_FREE_PLAN_NOTE).toContain("StartUp");
    expect(FX_FREE_PLAN_NOTE).toContain("60-second");
  });
});
