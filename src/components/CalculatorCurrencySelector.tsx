"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { CURRENCIES } from "@/components/dashboard/CurrencyContext";
import { useCalculatorCurrency } from "@/components/CalculatorCurrencyContext";
import { cn } from "@/lib/utils";

/**
 * The calculator's OWN currency selector — Phase 2 (onboarding plan,
 * PR B). Same searchable 148-currency list as the navbar converter,
 * but wired to the page-local calculator currency (see
 * CalculatorCurrencyContext): picking here changes this calculator
 * only and never persists anything — no PATCH /api/user, no
 * localStorage, no dashboard impact.
 */
export function CalculatorCurrencySelector() {
  const { currency, currencyDef, setCalculatorCurrency } =
    useCalculatorCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Reset query + autofocus search input whenever the dropdown opens
  /* eslint-disable react-hooks/set-state-in-effect -- dropdown-open reset: the search query must clear when the menu opens and the input must be focused after mount; both are external-DOM sync, not derived state */
  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredCurrencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [query]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Select the top filtered result on Enter
    if (e.key === "Enter" && filteredCurrencies.length > 0) {
      setCalculatorCurrency(filteredCurrencies[0].code);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Calculator currency: ${currencyDef.name}`}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)]",
          "bg-[var(--color-card)] px-2.5 text-xs text-[var(--color-foreground)]",
          "transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1",
        )}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded bg-[var(--color-primary)]/10 text-[11px] font-bold text-[var(--color-primary)]"
          aria-hidden
        >
          {currencyDef.symbol.length > 1
            ? currencyDef.code.slice(0, 2)
            : currencyDef.symbol}
        </span>
        <span className="font-medium tracking-wide">{currencyDef.code}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-[var(--color-muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select calculator currency"
          className={cn(
            "absolute right-0 z-50 mt-1 flex w-64 max-h-[70vh] flex-col overflow-hidden",
            "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl",
          )}
        >
          <p className="select-none px-3 pb-1.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Calculator Currency
          </p>

          <div className="px-2 pb-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search currency..."
                aria-label="Search calculator currency"
                className={cn(
                  "h-8 w-full rounded-md border border-transparent bg-[var(--color-muted)] pl-7 pr-2 text-sm",
                  "text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
                  "focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
                )}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto border-t border-[var(--color-border)] py-1 overscroll-contain">
            {filteredCurrencies.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-[var(--color-muted-foreground)]">
                No currencies found
              </p>
            ) : (
              filteredCurrencies.map((c) => {
                const isActive = c.code === currency;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setCalculatorCurrency(c.code);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                          isActive
                            ? "bg-[var(--color-primary)] text-white"
                            : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                        )}
                      >
                        {c.symbol.length > 2 ? c.code.slice(0, 2) : c.symbol}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span
                          className={cn(
                            "truncate font-medium",
                            isActive && "text-[var(--color-primary)]",
                          )}
                        >
                          {c.name}
                        </span>
                        <span className="text-[10px] text-[var(--color-muted-foreground)]">
                          {c.code}
                        </span>
                      </span>
                    </span>
                    {isActive && (
                      <Check className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
