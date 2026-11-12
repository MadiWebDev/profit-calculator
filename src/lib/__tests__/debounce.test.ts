import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce, SEARCH_DEBOUNCE_MS } from "@/lib/debounce";

describe("SEARCH_DEBOUNCE_MS", () => {
  it("is 300 ms — the delay the campaigns picker already used", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once, trailing-edge, after the delay", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("a");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("collapses a burst into one call with the latest arguments", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("a");
    vi.advanceTimersByTime(100);
    d("ab");
    vi.advanceTimersByTime(100);
    d("abc");
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("abc");
  });

  it("restarts the timer on every call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(90);
    d();
    vi.advanceTimersByTime(90);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops a pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("a");
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(d.pending).toBe(false);
  });

  it("flush() fires the pending call immediately and only once", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("a");
    vi.advanceTimersByTime(100);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush() with nothing pending is a no-op", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("reports pending while a call is waiting", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    expect(d.pending).toBe(false);
    d("a");
    expect(d.pending).toBe(true);
    vi.advanceTimersByTime(300);
    expect(d.pending).toBe(false);
  });
});
