import { describe, it, expect } from "vitest";
import { uploadProgressPercent } from "@/lib/upload-progress";

describe("uploadProgressPercent", () => {
  it("returns 0 when the total is unknown or zero (never fakes progress)", () => {
    expect(uploadProgressPercent(50, 0)).toBe(0);
    expect(uploadProgressPercent(50, -1)).toBe(0);
    expect(uploadProgressPercent(50, Number.NaN)).toBe(0);
  });

  it("returns 0 at the start and 100 at the end", () => {
    expect(uploadProgressPercent(0, 1000)).toBe(0);
    expect(uploadProgressPercent(1000, 1000)).toBe(100);
  });

  it("rounds to the nearest whole percent", () => {
    expect(uploadProgressPercent(1, 3)).toBe(33);
    expect(uploadProgressPercent(2, 3)).toBe(67);
    expect(uploadProgressPercent(999, 2000)).toBe(50);
  });

  it("clamps above 100 when the browser reports more than the total", () => {
    expect(uploadProgressPercent(1500, 1000)).toBe(100);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(uploadProgressPercent(Number.NaN, 100)).toBe(0);
    expect(uploadProgressPercent(50, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
