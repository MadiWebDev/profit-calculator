/**
 * Calculator-local currency helpers — Phase 2 (onboarding plan, PR B).
 *
 * The public calculators (/calculators/[slug]) get their OWN currency,
 * independent of the locked dashboard currency. All of the logic that
 * can be unit-tested lives here (node-safe, no React, no registry
 * import — the component passes the registry locale/symbol in).
 *
 * SEMANTICS — re-denomination, NOT FX conversion. The amounts a visitor
 * types are interpreted as being in the selected currency, and results
 * are computed from those inputs and formatted in the same currency.
 * No FX rates are fetched: /api/fx/rates requires auth, so a live
 * conversion is impossible for the logged-out visitors who are the
 * calculators' main audience, and a "convert my $100 to €92" model
 * would silently rewrite the numbers the visitor typed. Switching
 * currency re-denominates the calculator; it never rewrites values.
 *
 * Nothing here ever touches the dashboard currency: no PATCH /api/user,
 * no call to the persisting setCurrency, no localStorage writes.
 */

import {
  buildShareUrl,
  formatNumber,
  formatPercent,
} from "@/lib/utils";

/**
 * Format an amount in the given currency, using that currency's locale
 * (BCP 47, from the 148-currency registry) so symbol placement and
 * separators match the currency's home region.
 *
 * Fraction digits follow Intl's per-currency default (JPY 0, USD 2,
 * BHD 3) instead of forcing 2 everywhere — that is what makes the
 * formatting currency-correct rather than just dollar-shaped.
 *
 * Unknown currency codes (or a runtime without Intl currency support)
 * fall back to a plain 2-decimal number — never throws in the UI.
 */
export function formatCalculatorAmount(
  value: number,
  currency: string,
  locale: string = "en-US",
  compact: boolean = false,
): string {
  // Intl does NOT throw for an unknown code — it renders the generic
  // "¤" sign — so validate first: every one of the registry's 148
  // codes is in Intl.supportedValuesOf("currency"), and anything
  // outside it is not a real currency. Runtimes without
  // supportedValuesOf (very old browsers) skip the check and rely on
  // the try/catch below.
  try {
    const supported = (
      Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      }
    ).supportedValuesOf?.("currency");
    if (supported && !supported.includes(currency.toUpperCase())) {
      return value.toFixed(2);
    }
  } catch {
    return value.toFixed(2);
  }

  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
  };

  if (compact && Math.abs(value) >= 1_000) {
    options.notation = "compact";
    options.maximumFractionDigits = 1;
    options.minimumFractionDigits = 0;
  }

  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return value.toFixed(2);
  }
}

/**
 * Format one calculator output value for display, in the calculator's
 * own currency. Mirrors the format switch ProfitCalculator used to do
 * inline, so the rule is testable here.
 */
export function formatCalculatorOutput(
  value: number,
  format: "currency" | "percent" | "number" | "multiplier",
  currency: string,
  locale: string = "en-US",
): string {
  switch (format) {
    case "currency":
      return formatCalculatorAmount(value, currency, locale);
    case "percent":
      return formatPercent(value);
    case "multiplier":
      return `${value.toFixed(2)}x`;
    default:
      return formatNumber(value, 2);
  }
}

/**
 * Swap the dollar marker in a piece of calculator copy for the selected
 * currency's symbol, so preset/example amounts follow the selector:
 *   "Gateway Fixed Fee ($)" + "€"        → "Gateway Fixed Fee (€)"
 *   "Rate Needed for $100k/yr" + "€"     → "Rate Needed for €100k/yr"
 *   "every $1 spent returns $2" + "€"    → "every €1 spent returns €2"
 *
 * Only a bare "$" is replaced — one glued to a word (e.g. "US$") is a
 * different currency's marker and is left alone. A "$" symbol is a
 * no-op, so the default USD rendering is byte-identical to today.
 */
export function localizeCurrencyText(text: string, symbol: string): string {
  if (!text || symbol === "$") return text;
  return text.replace(/(?<![A-Za-z])\$/g, symbol);
}

/**
 * The "Copy results" clipboard text, in the calculator's own currency.
 * The currency code is in the header line so a pasted result is never
 * mistaken for dollars.
 */
export function buildCalculatorShareText(
  title: string,
  currency: string,
  lines: Array<{ label: string; value: string }>,
): string {
  const body = lines.map((l) => `${l.label}: ${l.value}`).join("\n");
  return `${title} Results (${currency})\n${"=".repeat(30)}\n${body}`;
}

/**
 * The share URL for a calculator state, with the calculator's currency
 * appended as a `currency` query param so opening a shared link
 * reproduces the same currency (still local per-page state — opening
 * the link never writes anything to the visitor's saved preference).
 */
export function buildCalculatorShareUrl(
  slug: string,
  values: Record<string, number | string>,
  currency: string,
): string {
  const base = buildShareUrl(slug, values);
  const separator = base.endsWith("?") ? "" : "&";
  return `${base}${separator}currency=${encodeURIComponent(currency)}`;
}

/**
 * Validate a `?currency=` query param (from a shared link): exactly
 * three letters, upper-cased. Anything else returns the fallback, so a
 * hand-edited or garbage param can never select a nonsense currency.
 * (Registry membership is checked by the component via
 * normalizeSavedCurrency — this is the shape check only.)
 */
export function parseCalculatorCurrencyParam(
  param: string | null,
  fallback: string,
): string {
  if (typeof param === "string" && /^[A-Za-z]{3}$/.test(param.trim())) {
    return param.trim().toUpperCase();
  }
  return fallback;
}
