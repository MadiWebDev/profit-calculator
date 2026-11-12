/**
 * Country → currency map tests — location auto-detect lookup.
 * Pure data + one pure function: no network, no database, no browser.
 */
import { describe, it, expect } from "vitest";
import { COUNTRY_CURRENCY, currencyForCountry } from "@/lib/country-currency";
import { CURRENCIES } from "@/components/dashboard/CurrencyContext";

describe("COUNTRY_CURRENCY coverage", () => {
  it("reaches every currency in the CURRENCIES registry from at least one country", () => {
    const reachable = new Set(Object.values(COUNTRY_CURRENCY));
    const missing = CURRENCIES.map((c) => c.code).filter((code) => !reachable.has(code));
    expect(missing).toEqual([]);
  });

  it("only ever maps to a valid registry code", () => {
    const registry = new Set(CURRENCIES.map((c) => c.code));
    const bad = Object.entries(COUNTRY_CURRENCY).filter(([, code]) => !registry.has(code));
    expect(bad).toEqual([]);
  });

  it("covers 200+ countries", () => {
    expect(Object.keys(COUNTRY_CURRENCY).length).toBeGreaterThanOrEqual(200);
  });
});

describe("currencyForCountry spot checks", () => {
  it.each([
    ["PK", "PKR"],
    ["GB", "GBP"],
    ["DE", "EUR"],
    ["JP", "JPY"],
    ["IN", "INR"],
    ["US", "USD"],
    ["FR", "EUR"],
    ["AE", "AED"],
    ["NG", "NGN"],
    ["CA", "CAD"],
    ["NZ", "NZD"],
    ["CH", "CHF"],
    ["AU", "AUD"],
    ["BR", "BRL"],
  ])("%s → %s", (country, currency) => {
    expect(currencyForCountry(country)).toBe(currency);
  });

  it("maps the currency unions (Eurozone, WAEMU, CEMAC, ECCU) and dollarized states", () => {
    // Eurozone
    expect(currencyForCountry("ES")).toBe("EUR");
    expect(currencyForCountry("IT")).toBe("EUR");
    expect(currencyForCountry("AT")).toBe("EUR");
    // WAEMU (West African CFA)
    expect(currencyForCountry("SN")).toBe("XOF");
    expect(currencyForCountry("ML")).toBe("XOF");
    // CEMAC (Central African CFA)
    expect(currencyForCountry("CM")).toBe("XAF");
    expect(currencyForCountry("GA")).toBe("XAF");
    // ECCU (East Caribbean Dollar)
    expect(currencyForCountry("GD")).toBe("XCD");
    expect(currencyForCountry("LC")).toBe("XCD");
    // Dollarized (no own currency in the registry)
    expect(currencyForCountry("EC")).toBe("USD");
    expect(currencyForCountry("SV")).toBe("USD");
    // Shared currencies
    expect(currencyForCountry("LI")).toBe("CHF");
    expect(currencyForCountry("CK")).toBe("NZD");
    expect(currencyForCountry("FO")).toBe("DKK");
    expect(currencyForCountry("PF")).toBe("XPF");
  });
});

describe("currencyForCountry edge cases", () => {
  it("returns null for unknown countries and bad input", () => {
    expect(currencyForCountry("XX")).toBeNull();
    expect(currencyForCountry("ZZ")).toBeNull();
    expect(currencyForCountry("")).toBeNull();
    expect(currencyForCountry("USA")).toBeNull();
    expect(currencyForCountry("U")).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
    expect(currencyForCountry(undefined)).toBeNull();
    expect(currencyForCountry(123)).toBeNull();
    expect(currencyForCountry({})).toBeNull();
  });

  it("normalises lowercase input and trims whitespace", () => {
    expect(currencyForCountry("pk")).toBe("PKR");
    expect(currencyForCountry(" gb ")).toBe("GBP");
  });
});
