import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AsyncActionController } from "@/lib/async-action";
import { LOADING_SHOW_DELAY_MS, LOADING_MIN_VISIBLE_MS } from "@/lib/loading-timing";

/**
 * Tests the async-action contract via the framework-free controller
 * (`src/lib/async-action.ts`), which the `useAsyncAction` hook wraps.
 * The hook itself cannot be rendered in this node vitest environment
 * (no jsdom / testing-library), so its React rendering is verified by
 * `tsc` + the production build instead — see docs/loading-patterns.md.
 */

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("AsyncActionController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stays unloaded for a fast action that finishes inside the show delay", async () => {
    const fn = vi.fn(async () => "ok");
    const onChange = vi.fn();
    const controller = new AsyncActionController(fn, {}, onChange);
    const result = await controller.run();
    expect(result).toBe("ok");
    expect(controller.state.loading).toBe(false);
    expect(controller.state.data).toBe("ok");
    expect(controller.state.error).toBeNull();
    // Loading was never reported true to subscribers.
    expect(onChange.mock.calls.some(([s]) => s.loading)).toBe(false);
  });

  it("becomes loading only after the show delay, and stays visible the minimum time", async () => {
    const gate = deferred<string>();
    const controller = new AsyncActionController(() => gate.promise);
    const runPromise = controller.run();

    await vi.advanceTimersByTimeAsync(LOADING_SHOW_DELAY_MS - 1);
    expect(controller.state.loading).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(controller.state.loading).toBe(true);

    const shownAt = Date.now();
    gate.resolve("done");
    await runPromise;
    // Finished while visible: still loading until the minimum visible
    // time has elapsed since it first appeared.
    expect(controller.state.loading).toBe(true);
    await vi.advanceTimersByTimeAsync(LOADING_MIN_VISIBLE_MS - (Date.now() - shownAt) - 1);
    expect(controller.state.loading).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.state.loading).toBe(false);
    expect(controller.state.data).toBe("done");
  });

  it("captures the error, rethrows it, and calls onError", async () => {
    const boom = new Error("boom");
    const onError = vi.fn();
    const controller = new AsyncActionController(
      async () => {
        throw boom;
      },
      { onError },
    );
    await expect(controller.run()).rejects.toThrow("boom");
    expect(controller.state.error).toBe(boom);
    expect(controller.state.loading).toBe(false);
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it("normalises non-Error throws and still rethrows an Error", async () => {
    const controller = new AsyncActionController(async () => {
      throw "plain string failure";
    });
    await expect(controller.run()).rejects.toThrow("plain string failure");
    expect(controller.state.error).toBeInstanceOf(Error);
    expect(controller.state.error?.message).toBe("plain string failure");
  });

  it("reset clears error and data and returns to idle", async () => {
    const controller = new AsyncActionController(async () => {
      throw new Error("nope");
    });
    await expect(controller.run()).rejects.toThrow("nope");
    expect(controller.state.error).not.toBeNull();
    controller.reset();
    expect(controller.state).toEqual({ loading: false, error: null, data: undefined });
  });

  it("a second run while loading returns the same in-flight promise and does not call fn again", async () => {
    const gate = deferred<string>();
    const fn = vi.fn(() => gate.promise);
    const controller = new AsyncActionController(fn);
    const first = controller.run();
    const second = controller.run();
    expect(second).toBe(first);
    expect(fn).toHaveBeenCalledTimes(1);
    gate.resolve("shared");
    await expect(first).resolves.toBe("shared");
    await expect(second).resolves.toBe("shared");
    expect(controller.state.data).toBe("shared");
  });

  it("after a run settles, a new run calls fn again", async () => {
    const fn = vi.fn(async () => "x");
    const controller = new AsyncActionController(fn);
    await controller.run();
    await controller.run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("reset during a run detaches the stale settle (no clobbering)", async () => {
    const gate = deferred<string>();
    const controller = new AsyncActionController(() => gate.promise);
    const runPromise = controller.run();
    controller.reset();
    gate.resolve("stale");
    await expect(runPromise).resolves.toBe("stale");
    // The reset state wins: the stale result must not reappear.
    expect(controller.state.data).toBeUndefined();
    expect(controller.state.loading).toBe(false);
  });

  it("calls onSuccess with the result", async () => {
    const onSuccess = vi.fn();
    const controller = new AsyncActionController(async () => 42, { onSuccess });
    await controller.run();
    expect(onSuccess).toHaveBeenCalledWith(42);
  });
});
