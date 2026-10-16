import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a numeric amount as a currency string.
 *
 * Uses the native Intl.NumberFormat API — no third-party library required.
 *
 * @param value    - The numeric amount to format.
 * @param currency - ISO 4217 currency code (e.g. "USD", "EUR"). Defaults to "USD".
 * @param compact  - When true, values ≥ 1 000 are abbreviated (e.g. "$1.2k").
 * @param locale   - BCP 47 locale string. When omitted the locale is derived from
 *                   the currency code so symbol placement and separators match the
 *                   currency's home region (e.g. "en-IN" for INR, "ur-PK" for PKR).
 */
export function formatCurrency(
  value: number,
  currency: string = "USD",
  compact: boolean = false,
  locale?: string,
): string {
  // Derive a sensible locale from the currency code when none is supplied.
  // This ensures correct symbol placement (e.g. "₹" prefix for INR) and
  // proper thousands separators for each region.
  const LOCALE_MAP: Record<string, string> = {
    USD: "en-US",
    EUR: "en-DE",
    GBP: "en-GB",
    PKR: "ur-PK",
    INR: "en-IN",
    CAD: "en-CA",
    AUD: "en-AU",
    AED: "ar-AE",
  };

  const resolvedLocale = locale ?? LOCALE_MAP[currency] ?? "en-US";

  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  if (compact && Math.abs(value) >= 1_000) {
    options.notation = "compact";
    options.maximumFractionDigits = 1;
    // compact notation looks cleaner without trailing zeros
    options.minimumFractionDigits = 0;
  }

  try {
    return new Intl.NumberFormat(resolvedLocale, options).format(value);
  } catch {
    // Graceful fallback: unknown currency code or unsupported runtime
    return value.toFixed(2);
  }
}


export function formatPercent(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


export function buildShareUrl(
  slug: string,
  values: Record<string, number | string>
): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => params.set(k, String(v)));
  return `/calculators/${slug}?${params.toString()}`;
}
