"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AsyncActionController,
  type AsyncActionOptions,
  type AsyncActionSnapshot,
} from "@/lib/async-action";

/**
 * `useAsyncAction(fn, options?)` — run an async function with honest
 * loading feedback, without hand-rolling `isLoading` / `setLoading` state.
 *
 * Returns `{ run, loading, error, data, reset }`:
 *  - `run(...args)` — calls `fn`, returns its result on success and
 *    RETHROWS on failure (so the call site can still `catch` it).
 *  - `loading` — follows the timing rules in `src/lib/loading-timing.ts`:
 *    it only turns `true` after a 200 ms delay, and once true it stays true
 *    for at least 400 ms. Fast actions never flash a spinner.
 *  - `error` — the thrown error (normalised to `Error`), or `null`.
 *  - `data` — the last successful result, or `undefined`.
 *  - `reset()` — clears `error`/`data` and returns to idle.
 *
 * CONTRACT (see `src/lib/async-action.ts` for the full contract + tests):
 *  - A second `run()` while one is in flight returns the same in-flight
 *    promise and does NOT call `fn` again — no double submits.
 *  - The hook never shows toasts. Pass `onSuccess` / `onError` in
 *    `options`, or catch the rethrown error at the call site, to decide
 *    the message.
 *
 * Example:
 * ```tsx
 * const save = useAsyncAction(
 *   async (values: FormValues) => api.save(values),
 *   { onError: (err) => toast.error(err.message) },
 * );
 * <Button loading={save.loading} onClick={() => save.run(values)}>Save</Button>
 * {save.error && <p role="alert">{save.error.message}</p>}
 * ```
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult,
  options: AsyncActionOptions<TResult> = {},
): {
  run: (...args: TArgs) => Promise<TResult>;
  loading: boolean;
  error: Error | null;
  data: TResult | undefined;
  reset: () => void;
} {
  const [snapshot, setSnapshot] = useState<AsyncActionSnapshot<TResult>>({
    loading: false,
    error: null,
    data: undefined,
  });

  // One controller for the lifetime of the hook, so an in-flight run (and
  // its timers) survives re-renders. It is created with the initial
  // fn/options; later fn/options are synced by the effects below.
  const [controller] = useState(
    () => new AsyncActionController<TArgs, TResult>(fn, options, setSnapshot),
  );

  useEffect(() => {
    controller.setFn(fn);
  }, [controller, fn]);
  useEffect(() => {
    controller.setOptions(options);
  }, [controller, options]);
  useEffect(() => () => controller.dispose(), [controller]);

  const run = useCallback(
    (...args: TArgs) => controller.run(...args),
    [controller],
  );
  const reset = useCallback(() => controller.reset(), [controller]);

  return {
    run,
    loading: snapshot.loading,
    error: snapshot.error,
    data: snapshot.data,
    reset,
  };
}
