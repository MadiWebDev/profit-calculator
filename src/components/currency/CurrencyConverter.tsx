"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { CURRENCIES, useCurrency } from "@/components/dashboard/CurrencyContext";
import { formatCurrency, cn } from "@/lib/utils";
import { formatRatesAsOf, FX_FREE_PLAN_NOTE } from "@/lib/display-currency";

/**
 * Compact live currency converter.
 *
 * Amount input, from/to pickers, live converted value at the rate the
 * CurrencyProvider refreshes every 60s. Every display is stamped with
 * "Rates as of HH:MM" (never fresher than it is) plus the honest-limit
 * note: on the free currencyapi.net plan the provider data refreshes
 * hourly — the 60s refresh only re-fetches the cached rate.
 *
 * Variants:
 *  - "popover": a small trigger button for the dashboard header —
 *    the full converter opens as a dropdown panel.
 *  - "inline": the full converter rendered in place — the footer of
 *    every marketing page.
 *
 * The "to" currency follows the display currency until the viewer
 * picks one explicitly (derived during render, no effect needed).
 */
export function CurrencyConverter({
  variant = "popover",
}: {
  variant?: "popover" | "inline";
}) {
  const { currency: displayCurrency, convertTo, ratesAsOf, ratesAvailable } = useCurrency();
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [toOverride, setToOverride] = useState<string | null>(null);
  const to = toOverride ?? displayCurrency;

  const parsed = Number(amount);
  const hasAmount = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const converted =
    hasAmount && ratesAvailable ? convertTo(parsed, from, to) : null;

  const form = (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="space-y-1">
          <label
            htmlFor={`fx-amount-${variant}`}
            className="text-xs font-medium text-[var(--color-muted-foreground)]"
          >
            Amount
          </label>
          <input
            id={`fx-amount-${variant}`}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="w-full h-9 px-2 rounded-md text-sm bg-[var(--color-muted)] text-[var(--color-foreground)] border border-transparent focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setToOverride(from);
          }}
          aria-label="Swap currencies"
          title="Swap currencies"
          className="h-9 w-9 mb-px flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
        >
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
        </button>
        <div className="space-y-1">
          <label
            htmlFor={`fx-to-${variant}`}
            className="text-xs font-medium text-[var(--color-muted-foreground)]"
          >
            To
          </label>
          <select
            id={`fx-to-${variant}`}
            value={to}
            onChange={(e) => setToOverride(e.target.value)}
            className="w-full h-9 px-1 rounded-md text-sm bg-[var(--color-muted)] text-[var(--color-foreground)] border border-transparent focus:border-[var(--color-primary)] focus:outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`fx-from-${variant}`}
          className="text-xs font-medium text-[var(--color-muted-foreground)]"
        >
          From
        </label>
        <select
          id={`fx-from-${variant}`}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full h-9 px-1 rounded-md text-sm bg-[var(--color-muted)] text-[var(--color-foreground)] border border-transparent focus:border-[var(--color-primary)] focus:outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>

      <p
        aria-live="polite"
        className="text-lg font-bold tabular-nums text-[var(--color-foreground)]"
      >
        {!hasAmount
          ? "Enter an amount to convert"
          : !ratesAvailable
            ? "Rates unavailable — try again shortly"
            : `${formatCurrency(parsed, from)} = ${formatCurrency(converted as number, to)}`}
      </p>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        {formatRatesAsOf(ratesAsOf)}
      </p>
      <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
        {FX_FREE_PLAN_NOTE}
      </p>
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Currency converter
        </h3>
        {form}
      </div>
    );
  }

  return <ConverterPopover form={form} />;
}

function ConverterPopover({ form }: { form: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open ]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Currency converter"
        title="Currency converter"
        className={cn(
          "flex h-9 sm:h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)]",
          "bg-[var(--color-card)] px-2.5 sm:px-3 text-xs font-medium text-[var(--color-foreground)]",
          "hover:bg-[var(--color-muted)] transition-colors focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1",
        )}
      >
        <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--color-primary)]" aria-hidden />
        <span className="hidden sm:inline">Convert</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Currency converter"
          className="absolute right-0 top-full z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-3">
            Currency converter
          </p>
          {form}
        </div>
      )}
    </div>
  );
}
