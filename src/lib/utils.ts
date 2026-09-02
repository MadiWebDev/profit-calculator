import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: number,
  currency: string = "USD",
  compact: boolean = false
): string {
  void currency; // currency param kept for API compatibility but symbol is suppressed
  const options: Intl.NumberFormatOptions = {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  if (compact && Math.abs(value) >= 1000) {
    options.notation = "compact";
    options.maximumFractionDigits = 1;
  }
  try {
    return new Intl.NumberFormat("en-US", options).format(value);
  } catch {
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
