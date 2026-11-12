/**
 * Loading timing rules — the single source of truth for every spinner,
 * skeleton, button and progress bar in the app.
 *
 * Two rules keep loading UI from flashing or flickering:
 *  1. SHOW DELAY (200 ms) — an async action that finishes quickly never
 *     shows a spinner/skeleton at all. The indicator only appears once the
 *     work has been running longer than this.
 *  2. MINIMUM VISIBLE TIME (400 ms) — once an indicator has appeared, it
 *     stays visible at least this long, even if the work finishes sooner,
 *     so the UI never strobes on and off.
 *
 * Components and hooks must import the constants / state machine below
 * instead of hard-coding the numbers. Everything here is pure and runs in
 * the node test environment (no DOM, no timers).
 */

export const LOADING_SHOW_DELAY_MS = 200;
export const LOADING_MIN_VISIBLE_MS = 400;

/** Phases of the delayed-show / minimum-visible state machine. */
export type LoadingVisibilityPhase =
  | "idle" // nothing running, nothing shown
  | "pending" // running, but not shown yet (inside the show delay)
  | "visible" // running and shown
  | "cooling"; // finished, but shown until the minimum visible time elapses

export interface LoadingVisibilityState {
  phase: LoadingVisibilityPhase;
  /** Monotonic timestamp (ms) when the run started. */
  startedAtMs: number;
  /** Monotonic timestamp (ms) when the indicator first became visible. */
  shownAtMs: number | null;
}

export function createLoadingVisibility(): LoadingVisibilityState {
  return { phase: "idle", startedAtMs: 0, shownAtMs: null };
}

/**
 * A run has started. From "idle" (or from any phase, after a reset) the
 * machine moves to "pending": the indicator is NOT visible yet.
 */
export function loadingStart(
  state: LoadingVisibilityState,
  nowMs: number,
): LoadingVisibilityState {
  return { phase: "pending", startedAtMs: nowMs, shownAtMs: null };
}

/**
 * Advance the machine to `nowMs`. A "pending" run becomes "visible" once
 * the show delay has elapsed; a "cooling" run returns to "idle" once the
 * minimum visible time has elapsed. Returns the new state.
 */
export function loadingTick(
  state: LoadingVisibilityState,
  nowMs: number,
): LoadingVisibilityState {
  if (state.phase === "pending" && nowMs - state.startedAtMs >= LOADING_SHOW_DELAY_MS) {
    return { ...state, phase: "visible", shownAtMs: nowMs };
  }
  if (
    state.phase === "cooling" &&
    state.shownAtMs !== null &&
    nowMs - state.shownAtMs >= LOADING_MIN_VISIBLE_MS
  ) {
    return createLoadingVisibility();
  }
  return state;
}

/**
 * The run has finished. If the indicator never appeared ("pending"), the
 * machine goes straight back to "idle" — no flash. If it is visible and
 * the minimum visible time has already elapsed, it goes to "idle" too.
 * Otherwise it moves to "cooling": still visible until the minimum time
 * elapses (advance with `loadingTick`).
 */
export function loadingFinish(
  state: LoadingVisibilityState,
  nowMs: number,
): LoadingVisibilityState {
  if (state.phase === "idle") return state;
  if (state.phase === "pending") return createLoadingVisibility();
  if (state.shownAtMs !== null && nowMs - state.shownAtMs >= LOADING_MIN_VISIBLE_MS) {
    return createLoadingVisibility();
  }
  return { ...state, phase: "cooling" };
}

/** True while the indicator should be on screen (visible or cooling down). */
export function isLoadingVisible(state: LoadingVisibilityState): boolean {
  return state.phase === "visible" || state.phase === "cooling";
}

/**
 * How long (ms) until the machine next needs a tick, or `null` when it is
 * settled. Use it to schedule the next timer instead of polling.
 *  - "pending": time remaining until the show delay elapses.
 *  - "cooling": time remaining until the minimum visible time elapses.
 *  - "idle"/"visible": null (nothing scheduled; "visible" only changes on finish).
 */
export function msUntilNextLoadingTick(
  state: LoadingVisibilityState,
  nowMs: number,
): number | null {
  if (state.phase === "pending") {
    return Math.max(0, LOADING_SHOW_DELAY_MS - (nowMs - state.startedAtMs));
  }
  if (state.phase === "cooling" && state.shownAtMs !== null) {
    return Math.max(0, LOADING_MIN_VISIBLE_MS - (nowMs - state.shownAtMs));
  }
  return null;
}
