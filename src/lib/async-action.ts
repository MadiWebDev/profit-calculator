/**
 * Framework-free controller behind `useAsyncAction`.
 *
 * Why a separate controller: the vitest environment is node (no jsdom, no
 * testing-library), so a React hook cannot be rendered in tests. This class
 * owns the whole async-action contract — delayed show, minimum visible time,
 * error capture, reset, and the concurrent-run policy — and is exercised
 * directly by `src/lib/__tests__/use-async-action.test.ts` with fake timers.
 * The hook (`src/hooks/use-async-action.ts`) is a thin React wrapper that
 * mirrors this controller's state into `useState`.
 *
 * CONTRACT
 *  - `run(...args)` calls `fn` and returns its result on success.
 *  - On failure it records the thrown value as `error` (normalised to an
 *    `Error`) and RETHROWS, so call sites can still handle the failure.
 *  - `loading` follows the timing rules in `loading-timing.ts`: it only
 *    becomes true after LOADING_SHOW_DELAY_MS, and once true it stays true
 *    for at least LOADING_MIN_VISIBLE_MS.
 *  - CONCURRENT RUNS: while a run is in flight, a second `run()` call is a
 *    no-op that returns the SAME in-flight promise. It does not start a
 *    second call to `fn` and it does not reset the timers. This prevents
 *    double submits and duplicate side effects (e.g. double charges).
 *  - The controller never shows toasts. Call sites decide the message
 *    (via `onSuccess` / `onError` or by catching the rethrown error).
 *  - `onChange` is called after every state transition so the hook (or any
 *    other subscriber) can re-render. It is the ONLY side effect here.
 *  - Timers are real `setTimeout`s; call `dispose()` when the owner
 *    unmounts so no timer fires after the fact.
 */

import {
  createLoadingVisibility,
  isLoadingVisible,
  loadingFinish,
  loadingStart,
  loadingTick,
  msUntilNextLoadingTick,
  type LoadingVisibilityState,
} from "./loading-timing";

export interface AsyncActionOptions<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

export interface AsyncActionSnapshot<TResult> {
  loading: boolean;
  error: Error | null;
  data: TResult | undefined;
}

export class AsyncActionController<
  TArgs extends unknown[],
  TResult,
> {
  private visibility: LoadingVisibilityState = createLoadingVisibility();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<TResult> | null = null;
  /** Monotonic run id. `reset()` bumps it, so a run that settles after a
   * reset recognises itself as stale and touches nothing. */
  private runSerial = 0;
  private snapshot: AsyncActionSnapshot<TResult> = {
    loading: false,
    error: null,
    data: undefined,
  };

  constructor(
    private fn: (...args: TArgs) => Promise<TResult> | TResult,
    private options: AsyncActionOptions<TResult> = {},
    private readonly onChange: (snapshot: AsyncActionSnapshot<TResult>) => void = () => {},
  ) {}

  /** Swap the wrapped function (used by the hook when the caller passes a
   * new `fn`). An in-flight run keeps the function it started with. */
  setFn(fn: (...args: TArgs) => Promise<TResult> | TResult): void {
    this.fn = fn;
  }

  /** Swap the callbacks (used by the hook when the caller passes new
   * `options`). */
  setOptions(options: AsyncActionOptions<TResult>): void {
    this.options = options;
  }

  get state(): AsyncActionSnapshot<TResult> {
    return { ...this.snapshot };
  }

  /** Start a run. See the contract above for the concurrent-run policy. */
  run(...args: TArgs): Promise<TResult> {
    if (this.inFlight) return this.inFlight;

    this.snapshot = { ...this.snapshot, error: null };
    this.visibility = loadingStart(this.visibility, Date.now());
    this.scheduleTick();
    const token = ++this.runSerial;

    const promise = (async (): Promise<TResult> => {
      try {
        const result = await this.fn(...args);
        // Only the latest run may settle the controller. A reset() while
        // running bumps runSerial, so a stale settle is a no-op instead
        // of clobbering the fresh state.
        if (this.runSerial !== token) return result;
        this.snapshot = { ...this.snapshot, data: result };
        this.settle();
        this.options.onSuccess?.(result);
        return result;
      } catch (thrown) {
        if (this.runSerial !== token) throw thrown;
        const error = thrown instanceof Error ? thrown : new Error(String(thrown));
        this.snapshot = { ...this.snapshot, error };
        this.settle();
        this.options.onError?.(error);
        throw error;
      } finally {
        if (this.runSerial === token) this.inFlight = null;
      }
    })();

    this.inFlight = promise;
    // Swallow unhandled-rejection noise only for the internally held
    // reference; callers of run() still receive the rejection.
    promise.catch(() => {});
    this.emit();
    return promise;
  }

  /**
   * Clear error/data and return to idle. If a run is in flight it keeps
   * running, but its result/error will no longer touch this controller
   * (see the `runSerial` guards in `run`).
   */
  reset(): void {
    // Bump the serial first so the in-flight run (if any) recognises
    // itself as stale when it settles.
    this.runSerial++;
    this.inFlight = null;
    this.clearTimer();
    this.visibility = createLoadingVisibility();
    this.snapshot = { loading: false, error: null, data: undefined };
    this.emit();
  }

  dispose(): void {
    this.clearTimer();
  }

  private settle(): void {
    this.visibility = loadingFinish(this.visibility, Date.now());
    this.scheduleTick();
    this.emit();
  }

  private scheduleTick(): void {
    this.clearTimer();
    const delay = msUntilNextLoadingTick(this.visibility, Date.now());
    if (delay === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.visibility = loadingTick(this.visibility, Date.now());
      this.scheduleTick();
      this.emit();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    const loading = isLoadingVisible(this.visibility);
    if (loading !== this.snapshot.loading) {
      this.snapshot = { ...this.snapshot, loading };
    }
    this.onChange({ ...this.snapshot });
  }
}
