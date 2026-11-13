import { describe, it, expect } from "vitest";
import { formatPercent, formatNumber } from "@/lib/utils";

// Guards for the OverviewClient crash: a legacy / directly-inserted order
// with no profitMargin passed undefined into formatPercent, whose unguarded
// value.toFixed() threw and broke the whole dashboard overview render.
// Non-finite input must render as 0, never throw.
describe("formatPercent guard", () => {
  it("formats finite values exactly as before", () => {
    expect(formatPercent(12.345, 1)).toBe("12.3%");
    expect(formatPercent(20)).toBe("20.00%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatPercent(-5, 1)).toBe("-5.0%");
  });

  it("renders undefined / null / NaN / Infinity as 0% instead of throwing", () => {
    expect(() => formatPercent(undefined as unknown as number)).not.toThrow();
    expect(formatPercent(undefined as unknown as number)).toBe("0.00%");
    expect(formatPercent(null as unknown as number)).toBe("0.00%");
    expect(formatPercent(NaN)).toBe("0.00%");
    expect(formatPercent(Infinity)).toBe("0.00%");
    expect(formatPercent(-Infinity, 1)).toBe("0.0%");
  });
});

describe("formatNumber guard", () => {
  it("formats finite values exactly as before", () => {
    expect(formatNumber(12.345, 1)).toBe("12.3");
    expect(formatNumber(20)).toBe("20.00");
    expect(formatNumber(0)).toBe("0.00");
  });

  it("renders undefined / null / NaN / Infinity as 0 instead of throwing", () => {
    expect(() => formatNumber(undefined as unknown as number)).not.toThrow();
    expect(formatNumber(undefined as unknown as number)).toBe("0.00");
    expect(formatNumber(null as unknown as number)).toBe("0.00");
    expect(formatNumber(NaN)).toBe("0.00");
    expect(formatNumber(Infinity)).toBe("0.00");
    expect(formatNumber(-Infinity, 1)).toBe("0.0");
  });
});
