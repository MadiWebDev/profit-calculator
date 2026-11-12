"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getCurrencyDef,
  normalizeSavedCurrency,
  useCurrency,
  type CurrencyDef,
} from "@/components/dashboard/CurrencyContext";
import { localizeCurrencyText } from "@/lib/calculator-currency";

/**
 * The calculator page's OWN currency — Phase 2 (onboarding plan, PR B).
 *
 * One instance per calculator page (the provider is mounted by
 * /calculators/[slug]/page.tsx around the calculator and its article).
 * The state is local to the page: it NEVER calls the dashboard
 * context's setCurrency (which would PATCH /api/user and overwrite the
 * visitor's saved/locked currency) and NEVER writes to localStorage.
 * Switching currency here re-denominates this calculator only — see
 * src/lib/calculator-currency.ts for the semantics.
 *
 * Default: the visitor's display currency from the shared context
 * (their saved/locked currency when signed in, geo-detected when
 * logged out), tracked live until the visitor picks one on this page.
 * The shared context resolves asynchronously (geo detection, workspace
 * fetch), so the default follows it while nothing has been picked yet.
 */

export interface CalculatorCurrencyValue {
  /** ISO 4217 code, e.g. "EUR" */
  currency: string;
  /** Full registry definition (symbol, locale, label) */
  currencyDef: CurrencyDef;
  /** Symbol string, e.g. "€" */
  symbol: string;
  /**
   * Pick the calculator's currency for this page only. Validates
   * against the 148-currency registry (unknown codes are ignored) and
   * marks the choice explicit, so later resolutions of the shared
   * display currency stop overwriting it.
   */
  setCalculatorCurrency: (code: string) => void;
}

const CalculatorCurrencyContext =
  createContext<CalculatorCurrencyValue | null>(null);

export function useCalculatorCurrency(): CalculatorCurrencyValue {
  const value = useContext(CalculatorCurrencyContext);
  if (!value) {
    throw new Error(
      "useCalculatorCurrency must be used inside <CalculatorCurrencyProvider>",
    );
  }
  return value;
}

export function CalculatorCurrencyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { currency: contextCurrency } = useCurrency();

  // Initialised from the shared context (which itself starts at its
  // fallback until its sources resolve); the effect below keeps it in
  // step until the visitor picks explicitly. This is the same first-
  // paint behaviour ProfitCalculator already had via useCurrency().
  const [currency, setCurrencyState] = useState<string>(contextCurrency);

  // The visitor picked a currency on this page — later-arriving
  // resolutions of the shared display currency must not overwrite an
  // explicit choice (e.g. geo detection landing after the pick).
  const pickedRef = useRef(false);

  // Track the shared display/geo currency while nothing has been
  // picked on this page. A state write in an effect is the only way
  // to hand the asynchronously-resolved default to every consumer at
  // once (same pattern as CurrencyContext's resolution effect).
  /* eslint-disable react-hooks/set-state-in-effect -- resolution sync: adopt the shared display currency until the visitor picks one on this page */
  useEffect(() => {
    if (pickedRef.current) return;
    if (contextCurrency !== currency) setCurrencyState(contextCurrency);
  }, [contextCurrency, currency]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setCalculatorCurrency = useCallback((code: string) => {
    const resolved = normalizeSavedCurrency(code);
    if (!resolved) return;
    pickedRef.current = true;
    setCurrencyState(resolved);
  }, []);

  const value = useMemo<CalculatorCurrencyValue>(() => {
    const currencyDef = getCurrencyDef(currency);
    return {
      currency: currencyDef.code,
      currencyDef,
      symbol: currencyDef.symbol,
      setCalculatorCurrency,
    };
  }, [currency, setCalculatorCurrency]);

  return (
    <CalculatorCurrencyContext.Provider value={value}>
      {children}
    </CalculatorCurrencyContext.Provider>
  );
}

/**
 * Calculator-page copy with the selected currency's symbol swapped in
 * for the "$" markers (worked example, how-to steps, FAQ answers).
 * Used by the server-rendered article sections of [slug]/page.tsx so
 * the example amounts follow the selector. JSON-LD / metadata keep
 * the raw text — structured data must not change with UI state.
 */
export function CalculatorCurrencyText({
  text,
  bold = false,
}: {
  text: string;
  /** Also convert **bold** markers, like the how-to steps use. */
  bold?: boolean;
}) {
  const { symbol } = useCalculatorCurrency();
  const localized = localizeCurrencyText(text, symbol);
  if (!bold) return <>{localized}</>;
  const html = localized.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="text-[var(--color-foreground)]">$1</strong>',
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
