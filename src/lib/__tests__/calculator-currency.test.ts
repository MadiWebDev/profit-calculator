/**
 * Calculator-local currency helpers — pure logic for the per-page
 * calculator currency selector (Phase 2). No network, no database,
 * no browser, no registry import.
 */
import { describe, it, expect } from "vitest";
import {
  formatCalculatorAmount,
  formatCalculatorOutput,
  localizeCurrencyText,
  buildCalculatorShareText,
  buildCalculatorShareUrl,
  parseCalculatorCurrencyParam,
} from "@/lib/calculator-currency";

describe("formatCalculatorAmount", () => {
  it("formats USD with the en-US locale", () => {
    expect(formatCalculatorAmount(1234.56, "USD", "en-US")).toBe("$1,234.56");
    expect(formatCalculatorAmount(0, "USD", "en-US")).toBe("$0.00");
    expect(formatCalculatorAmount(-42.5, "USD", "en-US")).toBe("-$42.50");
  });

  it("formats EUR with a German locale (symbol after the number)", () => {
    expect(formatCalculatorAmount(1234.56, "EUR", "de-DE")).toBe("1.234,56\u00a0€");
  });

  it("passes the registry locale through verbatim (EUR's registry locale is en-DE, which Intl renders English-style)", () => {
    expect(formatCalculatorAmount(1234.56, "EUR", "en-DE")).toBe("€1,234.56");
  });

  it("formats GBP with the en-GB locale", () => {
    expect(formatCalculatorAmount(99.9, "GBP", "en-GB")).toBe("£99.90");
  });

  it("uses Intl's per-currency fraction digits (JPY: 0, not forced 2)", () => {
    // ja-JP renders the full-width yen sign (U+FFE5); en-US the
    // half-width one (U+00A5). Either way the amount has 0 decimals.
    expect(formatCalculatorAmount(1234.56, "JPY", "ja-JP")).toBe("￥1,235");
    expect(formatCalculatorAmount(1234.56, "JPY", "en-US")).toBe("¥1,235");
    expect(formatCalculatorAmount(1234, "JPY", "ja-JP")).toBe("￥1,234");
  });

  it("formats PKR with the ur-PK locale", () => {
    const out = formatCalculatorAmount(27850, "PKR", "ur-PK");
    expect(out).toContain("27,850");
    expect(out).toMatch(/Rs/);
  });

  it("compacts large values when asked (chart axis ticks)", () => {
    expect(formatCalculatorAmount(1500, "USD", "en-US", true)).toBe("$1.5K");
    expect(formatCalculatorAmount(999, "USD", "en-US", true)).toBe("$999.00");
  });

  it("falls back to a plain number for an unknown currency code", () => {
    expect(formatCalculatorAmount(1234.56, "XXX", "en-US")).toBe("1234.56");
    expect(formatCalculatorAmount(1234.56, "ZZZ", "en-US")).toBe("1234.56");
  });
});

describe("formatCalculatorOutput", () => {
  it("routes each output format through the calculator currency", () => {
    expect(formatCalculatorOutput(1234.56, "currency", "EUR", "de-DE")).toBe(
      "1.234,56\u00a0€",
    );
    expect(formatCalculatorOutput(45.678, "percent", "EUR", "en-DE")).toBe("45.68%");
    expect(formatCalculatorOutput(2.5, "multiplier", "EUR", "en-DE")).toBe("2.50x");
    expect(formatCalculatorOutput(1234.567, "number", "EUR", "en-DE")).toBe("1234.57");
  });
});

describe("localizeCurrencyText", () => {
  it("swaps the ($) suffix in field labels", () => {
    expect(localizeCurrencyText("Gateway Fixed Fee ($)", "€")).toBe(
      "Gateway Fixed Fee (€)",
    );
    expect(localizeCurrencyText("Platform Fixed Fee ($)", "£")).toBe(
      "Platform Fixed Fee (£)",
    );
  });

  it("swaps $ amounts in example copy", () => {
    expect(
      localizeCurrencyText("every $1 spent returns $2", "€"),
    ).toBe("every €1 spent returns €2");
    expect(localizeCurrencyText("Rate Needed for $100k/yr", "₹")).toBe(
      "Rate Needed for ₹100k/yr",
    );
    expect(
      localizeCurrencyText("Stripe charges 2.9% + $0.30 per transaction", "€"),
    ).toBe("Stripe charges 2.9% + €0.30 per transaction");
  });

  it("leaves a bare US$ marker alone (a different currency's symbol)", () => {
    expect(localizeCurrencyText("priced in US$ for now", "€")).toBe(
      "priced in US$ for now",
    );
  });

  it("is a no-op for the $ symbol and for text without a marker", () => {
    expect(localizeCurrencyText("Gateway Fixed Fee ($)", "$")).toBe(
      "Gateway Fixed Fee ($)",
    );
    expect(localizeCurrencyText("Profit margin", "€")).toBe("Profit margin");
    expect(localizeCurrencyText("", "€")).toBe("");
  });
});

describe("buildCalculatorShareText", () => {
  it("names the currency in the header so pasted results are unambiguous", () => {
    const text = buildCalculatorShareText("Shopify Profit Calculator", "EUR", [
      { label: "Net Profit", value: "1.234,56\u00a0€" },
      { label: "Profit Margin", value: "45.50%" },
    ]);
    expect(text).toBe(
      "Shopify Profit Calculator Results (EUR)\n" +
        "==============================\n" +
        "Net Profit: 1.234,56\u00a0€\n" +
        "Profit Margin: 45.50%",
    );
  });
});

describe("buildCalculatorShareUrl", () => {
  it("appends the currency param to the field params", () => {
    expect(
      buildCalculatorShareUrl(
        "shopify-profit",
        { sellingPrice: 49.99, productCost: 12 },
        "EUR",
      ),
    ).toBe(
      "/calculators/shopify-profit?sellingPrice=49.99&productCost=12&currency=EUR",
    );
  });

  it("still appends the param when there are no field values", () => {
    expect(buildCalculatorShareUrl("tax-on-sale", {}, "JPY")).toBe(
      "/calculators/tax-on-sale?currency=JPY",
    );
  });
});

describe("parseCalculatorCurrencyParam", () => {
  it("accepts three letters, upper-casing them", () => {
    expect(parseCalculatorCurrencyParam("eur", "USD")).toBe("EUR");
    expect(parseCalculatorCurrencyParam("GBP", "USD")).toBe("GBP");
    expect(parseCalculatorCurrencyParam(" jpy ", "USD")).toBe("JPY");
  });

  it("falls back for missing, short, long, or non-letter params", () => {
    expect(parseCalculatorCurrencyParam(null, "USD")).toBe("USD");
    expect(parseCalculatorCurrencyParam("", "USD")).toBe("USD");
    expect(parseCalculatorCurrencyParam("US", "USD")).toBe("USD");
    expect(parseCalculatorCurrencyParam("USDD", "USD")).toBe("USD");
    expect(parseCalculatorCurrencyParam("U5D", "USD")).toBe("USD");
    expect(parseCalculatorCurrencyParam("EU R", "USD")).toBe("USD");
  });
});
