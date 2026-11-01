/**
 * currencyapi.net FX provider tests.
 *
 * Covers the three traps that would silently break profit reports:
 *  1. currencyapi.net omits the base currency from `rates`, so USD must
 *     be injected as 1 — otherwise convertCurrency() throws for USD.
 *  2. Free-plan accounts have a fixed base, so any requested base must
 *     be derived mathematically from USD rates.
 *  3. A provider outage must not 503 every report: er-api fallback,
 *     then stale cached rates, then (only with no cache at all) throw.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getFxRates,
  clearFxCache,
  parseCurrencyApiRates,
  rebaseRates,
} from "@/lib/fx";
import { convertCurrency } from "@/lib/profit-engine";

const CURRENCY_API_PAYLOAD = {
  valid: true,
  updated: 1768586454,
  base: "USD",
  rates: { EUR: 0.92, PKR: 278.5, GBP: 0.79, BAD: "not-a-number", ZERO: 0 },
};

function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => handler(url)),
  );
}

function okJson(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

function httpError(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

beforeEach(() => {
  clearFxCache();
  delete process.env.CURRENCY_API_KEY;
  delete process.env.CURRENCY_API_CACHE_TTL_SECONDS;
});

afterEach(() => {
  clearFxCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.CURRENCY_API_KEY;
  delete process.env.CURRENCY_API_CACHE_TTL_SECONDS;
});

describe("parseCurrencyApiRates", () => {
  it("injects USD = 1 and keeps the provider updated timestamp", () => {
    const parsed = parseCurrencyApiRates(CURRENCY_API_PAYLOAD);
    expect(parsed.base).toBe("USD");
    expect(parsed.rates.USD).toBe(1);
    expect(parsed.rates.EUR).toBe(0.92);
    expect(parsed.fetchedAt).toBe(new Date(1768586454 * 1000).toISOString());
  });

  it("drops non-numeric and non-positive rates", () => {
    const parsed = parseCurrencyApiRates(CURRENCY_API_PAYLOAD);
    expect(parsed.rates.BAD).toBeUndefined();
    expect(parsed.rates.ZERO).toBeUndefined();
  });

  it("throws on valid:false and on missing rates", () => {
    expect(() => parseCurrencyApiRates({ valid: false, message: "bad key", rates: {} })).toThrow(
      /bad key/,
    );
    expect(() => parseCurrencyApiRates({ valid: true, rates: null })).toThrow();
    expect(() => parseCurrencyApiRates({ valid: true, rates: {} })).toThrow();
  });
});

describe("rebaseRates", () => {
  it("re-bases USD rates to EUR, preserving conversion ratios", () => {
    const rebased = rebaseRates({ USD: 1, EUR: 0.92, PKR: 278.5 }, "EUR");
    expect(rebased.EUR).toBe(1);
    expect(rebased.USD).toBeCloseTo(1 / 0.92, 10);
    expect(rebased.PKR).toBeCloseTo(278.5 / 0.92, 10);
    // Ratio check: 100 USD -> EUR -> PKR must equal 100 USD -> PKR.
    expect(convertCurrency(100, "USD", "EUR", rebased)).toBe(92);
    expect(convertCurrency(92, "EUR", "PKR", rebased)).toBeCloseTo(27850, 0);
  });

  it("throws for an unknown target base", () => {
    expect(() => rebaseRates({ USD: 1, EUR: 0.92 }, "XXX")).toThrow(/Unknown FX rate/);
  });
});

describe("getFxRates with currencyapi.net", () => {
  it("fetches currencyapi.net and makes USD conversions work (base=1 trap)", async () => {
    process.env.CURRENCY_API_KEY = "test-key";
    const seen: string[] = [];
    mockFetch((url) => {
      seen.push(url);
      return okJson(CURRENCY_API_PAYLOAD);
    });
    const fx = await getFxRates("USD");
    expect(seen[0]).toContain("currencyapi.net/api/v2/rates");
    expect(seen[0]).toContain("base=USD");
    expect(fx.rates.USD).toBe(1);
    // This is the regression the injection fixes: without USD=1 this throws.
    expect(convertCurrency(100, "USD", "EUR", fx.rates)).toBe(92);
  });

  it("re-bases to a requested base instead of trusting the provider base", async () => {
    process.env.CURRENCY_API_KEY = "test-key";
    mockFetch(() => okJson(CURRENCY_API_PAYLOAD));
    const fx = await getFxRates("EUR");
    expect(fx.base).toBe("EUR");
    expect(fx.rates.EUR).toBe(1);
    expect(fx.rates.USD).toBeCloseTo(1 / 0.92, 10);
    expect(fx.rates.PKR).toBeCloseTo(278.5 / 0.92, 10);
  });

  it("falls back to er-api when currencyapi.net fails", async () => {
    process.env.CURRENCY_API_KEY = "test-key";
    mockFetch((url) =>
      url.includes("currencyapi.net")
        ? httpError(500)
        : okJson({ result: "success", base_code: "EUR", rates: { USD: 1.08, EUR: 1, PKR: 302 } }),
    );
    const fx = await getFxRates("EUR");
    expect(fx.base).toBe("EUR");
    expect(fx.rates.PKR).toBe(302);
  });

  it("serves stale cached rates when both providers fail", async () => {
    process.env.CURRENCY_API_KEY = "test-key";
    process.env.CURRENCY_API_CACHE_TTL_SECONDS = "60";
    mockFetch(() => okJson(CURRENCY_API_PAYLOAD));
    const fresh = await getFxRates("USD");
    expect(fresh.rates.EUR).toBe(0.92);

    // Advance past the 60s TTL, then break both providers.
    const nowSpy = vi.spyOn(Date, "now");
    const t0 = Date.now();
    nowSpy.mockImplementation(() => t0 + 61_000);
    mockFetch(() => httpError(503));
    const stale = await getFxRates("USD");
    expect(stale.rates.EUR).toBe(0.92);
    nowSpy.mockRestore();
  });

  it("throws only when there is no cache and both providers fail", async () => {
    process.env.CURRENCY_API_KEY = "test-key";
    mockFetch(() => httpError(503));
    await expect(getFxRates("USD")).rejects.toThrow();
  });

  it("falls back to er-api with no key at all", async () => {
    mockFetch((url) => {
      expect(url).not.toContain("currencyapi.net");
      return okJson({ result: "success", base_code: "USD", rates: { USD: 1, EUR: 0.92 } });
    });
    const fx = await getFxRates("USD");
    expect(fx.rates.EUR).toBe(0.92);
    expect(fx.rates.USD).toBe(1);
  });

  it("rejects invalid currency codes without calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getFxRates("US")).rejects.toThrow(/Invalid currency code/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
