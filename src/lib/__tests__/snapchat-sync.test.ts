import "./setup-env";
import { describe, it, expect } from "vitest";
import { snapchatMicroToCurrency } from "@/lib/sync/snapchat-ads";

describe("snapchatMicroToCurrency (F2b)", () => {
  it("divides micro-currency by 1e6", () => {
    // $50.00 of spend arrives as 50,000,000 micro units
    expect(snapchatMicroToCurrency(50_000_000)).toBe(50);
    expect(snapchatMicroToCurrency(1_000_000)).toBe(1);
    expect(snapchatMicroToCurrency(2_500_000)).toBe(2.5);
  });

  it("returns 0 for 0 and for non-finite input", () => {
    expect(snapchatMicroToCurrency(0)).toBe(0);
    expect(snapchatMicroToCurrency(Number.NaN)).toBe(0);
    expect(snapchatMicroToCurrency(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("does not inflate a raw micro value (the old bug stored it as-is)", () => {
    // Before the fix, 50,000,000 micro was stored as $50,000,000.
    const stored = snapchatMicroToCurrency(50_000_000);
    expect(stored).not.toBe(50_000_000);
    expect(stored).toBe(50);
  });
});
