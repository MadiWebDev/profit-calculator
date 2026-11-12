"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  debounce,
  SEARCH_DEBOUNCE_MS,
  type DebouncedFunction,
} from "@/lib/debounce";

/**
 * `useDebouncedValue(value, delayMs?)` — the shared debounced-search
 * hook (Phase 1b). Returns the value as it was `delayMs` ago, so a
 * search/fetch only fires once the user stops typing.
 *
 * - `debouncedValue` — the settled value; drive fetches/filters from this.
 * - `isPending` — true while the typed value has not settled yet; show a
 *   small inline `Spinner` in the input while true.
 * - `flush()` — settle immediately (e.g. a search form's submit); the
 *   pending timer is cancelled and the current value is applied at once.
 *
 * The pure debounce logic lives in `src/lib/debounce.ts` and is unit
 * tested there; this hook is a thin React wrapper (verified by `tsc` +
 * the production build, like `useAsyncAction`).
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number = SEARCH_DEBOUNCE_MS,
): {
  debouncedValue: T;
  isPending: boolean;
  flush: () => void;
} {
  const [debouncedValue, setDebouncedValue] = useState(value);

  // One debounced setter for the lifetime of the hook. `delayMs` is a
  // constant at every call site; a changing delay would need a new
  // debounced function, which this hook intentionally does not do.
  const applyRef = useRef<DebouncedFunction<[T]> | null>(null);
  if (applyRef.current === null) {
    applyRef.current = debounce((v: T) => setDebouncedValue(v), delayMs);
  }
  useEffect(() => () => applyRef.current?.cancel(), []);

  useEffect(() => {
    applyRef.current?.(value);
  }, [value]);

  const flush = useCallback(() => {
    // Fire the pending call if there is one; then settle directly so a
    // submit in the same tick as a keystroke still applies at once.
    applyRef.current?.flush();
    setDebouncedValue(value);
  }, [value]);

  return { debouncedValue, isPending: value !== debouncedValue, flush };
}
