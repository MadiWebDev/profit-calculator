"use client";

import { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { CURRENCIES, useCurrency } from "@/components/dashboard/CurrencyContext";
import { cn } from "@/lib/utils";

interface CurrencySelectorProps {
  /** "sm" = compact icon-only trigger (mobile topbar), "md" = default with code label */
  size?: "sm" | "md";
}

const DROPDOWN_WIDTH = 256; // matches w-64
const VIEWPORT_MARGIN = 12; // min gap kept between the dropdown and the screen edge

export function CurrencySelector({ size = "md" }: CurrencySelectorProps) {
  const { currency, setCurrency, currencyDef } = useCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fixed-position coordinates for the dropdown, computed from the trigger's
  // on-screen position. Using `position: fixed` (rather than absolute) means
  // the dropdown is never clipped by an ancestor with overflow-hidden — e.g.
  // when this selector is rendered inside the navbar's animated mobile menu.
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Clamp dropdown width so it never exceeds the viewport on very narrow phones.
    const width = Math.min(DROPDOWN_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);

    // Default: right-align the dropdown to the trigger's right edge.
    let left = rect.right - width;
    // Keep it from overflowing the left edge.
    left = Math.max(VIEWPORT_MARGIN, left);
    // Keep it from overflowing the right edge.
    left = Math.min(left, viewportWidth - width - VIEWPORT_MARGIN);

    setCoords({ top: rect.bottom + 6, left, width });
  }, []);

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
  useEffect(() => {
    if (open) {
      setQuery("");
      // Wait a tick for the input to mount before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Position the dropdown before paint, and keep it correct across resize,
  // scroll, and orientation changes (e.g. rotating a phone while it's open).
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

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
      setCurrency(filteredCurrencies[0].code);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* ── Trigger button ─────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Currency: ${currencyDef.name}`}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-[var(--color-border)]",
          "bg-[var(--color-card)] text-[var(--color-foreground)]",
          "hover:bg-[var(--color-muted)] transition-colors focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1",
          // A touch target of ~36-40px is easier to tap accurately than the
          // original 32px on phones, while staying compact on desktop.
          size === "sm" ? "h-9 sm:h-8 px-2.5 sm:px-2 text-xs" : "h-9 sm:h-8 px-3 text-xs",
        )}
      >
        {/* Symbol badge */}
        <span
          className={cn(
            "flex items-center justify-center rounded font-bold",
            "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
            size === "sm" ? "h-4.5 w-5 text-[11px]" : "h-5 w-5 text-[11px]",
          )}
          aria-hidden
        >
          {currencyDef.symbol.length > 1 ? currencyDef.code.slice(0, 2) : currencyDef.symbol}
        </span>

        {size === "md" && (
          <span className="font-medium tracking-wide">{currencyDef.code}</span>
        )}

        <ChevronDown
          className={cn(
            "h-3 w-3 text-[var(--color-muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* ── Dropdown ───────────────────────────────────────────────────── */}
      {open && coords && (
        <div
          role="listbox"
          aria-label="Select currency"
          style={{ top: coords.top, left: coords.left, width: coords.width }}
          className={cn(
            // position: fixed + viewport-relative coords computed above means
            // this always renders above the page, unclipped by any ancestor
            // (including the navbar's overflow-hidden mobile menu wrapper),
            // and stays fully on-screen down to ~320px-wide phones.
            "fixed z-50 rounded-xl border border-[var(--color-border)]",
            "bg-[var(--color-card)] shadow-xl overflow-hidden flex flex-col",
            "max-h-[70vh]",
          )}
        >
          {/* Header */}
          <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] select-none">
            Display Currency
          </p>

          {/* Search input */}
          <div className="px-2 pb-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted-foreground)]"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search currency..."
                aria-label="Search currency"
                className={cn(
                  "w-full h-9 sm:h-8 pl-7 pr-2 rounded-md text-sm",
                  "bg-[var(--color-muted)] text-[var(--color-foreground)]",
                  "placeholder:text-[var(--color-muted-foreground)]",
                  "border border-transparent focus:border-[var(--color-primary)]",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]",
                )}
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-64 overflow-y-auto py-1 border-t border-[var(--color-border)] overscroll-contain">
            {filteredCurrencies.length === 0 ? (
              <p className="px-3 py-4 text-sm text-center text-[var(--color-muted-foreground)]">
                No currencies found
              </p>
            ) : (
              filteredCurrencies.map((c) => {
                const isActive = c.code === currency;
                return (
                  <button
                    key={c.code}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setCurrency(c.code);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-3 py-2.5 sm:py-2 text-sm",
                      "transition-colors text-left",
                      isActive
                        ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                    )}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      {/* Symbol pill */}
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold flex-shrink-0",
                          isActive
                            ? "bg-[var(--color-primary)] text-white"
                            : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                        )}
                      >
                        {c.symbol.length > 2 ? c.code.slice(0, 2) : c.symbol}
                      </span>

                      <span className="flex flex-col min-w-0">
                        <span className={cn("font-medium truncate", isActive && "text-[var(--color-primary)]")}>
                          {c.name}
                        </span>
                        <span className="text-[10px] text-[var(--color-muted-foreground)]">
                          {c.code}
                        </span>
                      </span>
                    </span>

                    {isActive && <Check className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />}
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