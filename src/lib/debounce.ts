/**
 * Shared debounce helper — the single debounce implementation for the
 * whole app (Phase 1b). Search inputs use it through
 * `src/hooks/use-debounced-value.ts`; do not hand-roll `setTimeout`
 * debounces in components.
 *
 * Pure and runs in the node test environment (see
 * `src/lib/__tests__/debounce.test.ts`).
 */

/** Delay before a debounced search fires — matches the 300 ms the
 * admin campaigns picker already used, so behaviour is unchanged there. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface DebouncedFunction<Args extends unknown[]> {
  (...args: Args): void;
  /** Drop any pending call. */
  cancel: () => void;
  /** Fire the pending call immediately (no-op when nothing is pending). */
  flush: () => void;
  /** True while a call is waiting to fire. */
  readonly pending: boolean;
}

/**
 * Trailing-edge debounce: `fn` runs `waitMs` after the LAST call.
 * Only the latest arguments are used; bursts collapse into one call.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): DebouncedFunction<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | undefined;

  const invoke = () => {
    timer = null;
    if (lastArgs !== undefined) {
      const args = lastArgs;
      lastArgs = undefined;
      fn(...args);
    }
  };

  const debounced = (...args: Args) => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(invoke, waitMs);
  };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = undefined;
  };

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      invoke();
    }
  };

  Object.defineProperty(debounced, "pending", {
    get: () => timer !== null,
  });

  return debounced as DebouncedFunction<Args>;
}
