import { describe, it, expect } from "vitest";
import {
  LOADING_SHOW_DELAY_MS,
  LOADING_MIN_VISIBLE_MS,
  createLoadingVisibility,
  loadingStart,
  loadingTick,
  loadingFinish,
  isLoadingVisible,
  msUntilNextLoadingTick,
} from "@/lib/loading-timing";

describe("loading timing constants", () => {
  it("documents the 200 ms show delay and 400 ms minimum visible time", () => {
    expect(LOADING_SHOW_DELAY_MS).toBe(200);
    expect(LOADING_MIN_VISIBLE_MS).toBe(400);
  });
});

describe("loading visibility state machine", () => {
  it("starts idle and invisible", () => {
    const state = createLoadingVisibility();
    expect(state.phase).toBe("idle");
    expect(isLoadingVisible(state)).toBe(false);
  });

  it("stays invisible inside the show delay", () => {
    let state = loadingStart(createLoadingVisibility(), 1000);
    expect(state.phase).toBe("pending");
    state = loadingTick(state, 1000 + LOADING_SHOW_DELAY_MS - 1);
    expect(state.phase).toBe("pending");
    expect(isLoadingVisible(state)).toBe(false);
  });

  it("becomes visible exactly at the show delay", () => {
    let state = loadingStart(createLoadingVisibility(), 1000);
    state = loadingTick(state, 1000 + LOADING_SHOW_DELAY_MS);
    expect(state.phase).toBe("visible");
    expect(isLoadingVisible(state)).toBe(true);
    expect(state.shownAtMs).toBe(1000 + LOADING_SHOW_DELAY_MS);
  });

  it("returns straight to idle when finishing before ever showing (no flash)", () => {
    let state = loadingStart(createLoadingVisibility(), 1000);
    state = loadingTick(state, 1100);
    state = loadingFinish(state, 1150);
    expect(state.phase).toBe("idle");
    expect(isLoadingVisible(state)).toBe(false);
  });

  it("cools down when finishing before the minimum visible time", () => {
    let state = loadingStart(createLoadingVisibility(), 1000);
    state = loadingTick(state, 1200); // visible at t=1200
    state = loadingFinish(state, 1300); // only 100 ms visible
    expect(state.phase).toBe("cooling");
    expect(isLoadingVisible(state)).toBe(true);
    // Still visible 1 ms before the minimum elapses…
    state = loadingTick(state, 1200 + LOADING_MIN_VISIBLE_MS - 1);
    expect(state.phase).toBe("cooling");
    expect(isLoadingVisible(state)).toBe(true);
    // …and idle exactly when it elapses.
    state = loadingTick(state, 1200 + LOADING_MIN_VISIBLE_MS);
    expect(state.phase).toBe("idle");
    expect(isLoadingVisible(state)).toBe(false);
  });

  it("goes straight to idle when finishing after the minimum visible time", () => {
    let state = loadingStart(createLoadingVisibility(), 1000);
    state = loadingTick(state, 1200);
    state = loadingFinish(state, 1200 + LOADING_MIN_VISIBLE_MS);
    expect(state.phase).toBe("idle");
    expect(isLoadingVisible(state)).toBe(false);
  });

  it("finish on an idle machine is a no-op", () => {
    const state = loadingFinish(createLoadingVisibility(), 5000);
    expect(state.phase).toBe("idle");
  });

  it("tick on an idle machine is a no-op", () => {
    const state = loadingTick(createLoadingVisibility(), 5000);
    expect(state.phase).toBe("idle");
  });

  it("a new start resets a cooling machine", () => {
    let state = loadingStart(createLoadingVisibility(), 1000);
    state = loadingTick(state, 1200);
    state = loadingFinish(state, 1300);
    expect(state.phase).toBe("cooling");
    state = loadingStart(state, 1400);
    expect(state.phase).toBe("pending");
    expect(state.shownAtMs).toBeNull();
    expect(isLoadingVisible(state)).toBe(false);
  });
});

describe("msUntilNextLoadingTick", () => {
  it("returns the remaining show delay while pending", () => {
    const state = loadingStart(createLoadingVisibility(), 1000);
    expect(msUntilNextLoadingTick(state, 1050)).toBe(150);
  });

  it("returns the remaining minimum-visible time while cooling", () => {
    let state = loadingStart(createLoadingVisibility(), 1000);
    state = loadingTick(state, 1200);
    state = loadingFinish(state, 1300);
    expect(msUntilNextLoadingTick(state, 1400)).toBe(200);
  });

  it("returns null when settled (idle or visible)", () => {
    expect(msUntilNextLoadingTick(createLoadingVisibility(), 1000)).toBeNull();
    let state = loadingStart(createLoadingVisibility(), 1000);
    state = loadingTick(state, 1200);
    expect(msUntilNextLoadingTick(state, 1300)).toBeNull();
  });

  it("never returns a negative delay", () => {
    const state = loadingStart(createLoadingVisibility(), 1000);
    expect(msUntilNextLoadingTick(state, 5000)).toBe(0);
  });
});
