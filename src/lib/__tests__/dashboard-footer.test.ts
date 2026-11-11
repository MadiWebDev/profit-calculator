import { describe, it, expect } from "vitest";
import {
  isDashboardPath,
  parseStoredPreference,
  resolveDashboardFooterCollapsed,
  serializePreference,
} from "@/lib/dashboard-footer";

describe("isDashboardPath", () => {
  it("matches the dashboard and its sub-pages", () => {
    expect(isDashboardPath("/dashboard")).toBe(true);
    expect(isDashboardPath("/dashboard/orders")).toBe(true);
    expect(isDashboardPath("/dashboard/currency")).toBe(true);
  });

  it("does not match look-alikes or other pages", () => {
    expect(isDashboardPath("/dashboardx")).toBe(false);
    expect(isDashboardPath("/pricing")).toBe(false);
    expect(isDashboardPath("/")).toBe(false);
    expect(isDashboardPath(null)).toBe(false);
    expect(isDashboardPath("")).toBe(false);
  });
});

describe("parseStoredPreference / serializePreference", () => {
  it("round-trips the two values we write", () => {
    expect(parseStoredPreference("open")).toBe("open");
    expect(parseStoredPreference("closed")).toBe("closed");
    expect(serializePreference(true)).toBe("closed");
    expect(serializePreference(false)).toBe("open");
  });

  it("treats anything else as no preference", () => {
    expect(parseStoredPreference("yes")).toBeNull();
    expect(parseStoredPreference("")).toBeNull();
    expect(parseStoredPreference(null)).toBeNull();
  });
});

describe("resolveDashboardFooterCollapsed", () => {
  it("a saved preference wins over the screen size", () => {
    expect(
      resolveDashboardFooterCollapsed({ stored: "closed", isSmallScreen: false }),
    ).toBe(true);
    expect(
      resolveDashboardFooterCollapsed({ stored: "open", isSmallScreen: true }),
    ).toBe(false);
  });

  it("with no preference, small screens start collapsed and large ones expanded", () => {
    expect(
      resolveDashboardFooterCollapsed({ stored: null, isSmallScreen: true }),
    ).toBe(true);
    expect(
      resolveDashboardFooterCollapsed({ stored: null, isSmallScreen: false }),
    ).toBe(false);
  });
});
