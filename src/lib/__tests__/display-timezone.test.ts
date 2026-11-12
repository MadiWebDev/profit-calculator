/**
 * Display timezone — precedence and formatting in the locked zone.
 * The instant 2026-01-15T00:30:00Z is Jan 15 05:30 in Karachi (UTC+5)
 * and Jan 14 19:30 in New York (UTC-5), which pins the zone handling.
 */
import { describe, it, expect } from "vitest";
import {
  resolveDisplayTimezone,
  formatDateInTimezone,
  formatDateFullInTimezone,
  formatDateTimeInTimezone,
  formatTimeInTimezone,
} from "@/lib/display-timezone";

const INSTANT = "2026-01-15T00:30:00.000Z";

describe("resolveDisplayTimezone", () => {
  it("prefers the locked user timezone over the team timezone", () => {
    expect(
      resolveDisplayTimezone({ userTimezone: "Asia/Karachi", teamTimezone: "Europe/London" }),
    ).toBe("Asia/Karachi");
  });

  it("falls back to the team timezone, then to a real zone (browser/UTC)", () => {
    expect(resolveDisplayTimezone({ userTimezone: null, teamTimezone: "Europe/London" })).toBe(
      "Europe/London",
    );
    // No user/team zone: whatever comes back must be a usable IANA zone.
    const tz = resolveDisplayTimezone({ userTimezone: null, teamTimezone: null });
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz })).not.toThrow();
  });

  it("ignores invalid zones and falls through", () => {
    expect(
      resolveDisplayTimezone({ userTimezone: "Mars/Olympus", teamTimezone: "Asia/Karachi" }),
    ).toBe("Asia/Karachi");
    expect(
      resolveDisplayTimezone({ userTimezone: "Mars/Olympus", teamTimezone: "Also/Bad" }),
    ).not.toBe("Mars/Olympus");
  });
});

describe("formatters in the display timezone", () => {
  it("formats the date in Karachi (Jan 15) vs New York (Jan 14)", () => {
    expect(formatDateInTimezone(INSTANT, "Asia/Karachi")).toBe("Jan 15");
    expect(formatDateInTimezone(INSTANT, "America/New_York")).toBe("Jan 14");
  });

  it("formats full dates and times in the zone", () => {
    expect(formatDateFullInTimezone(INSTANT, "Asia/Karachi")).toBe("Jan 15, 2026");
    expect(formatDateFullInTimezone(INSTANT, "America/New_York")).toBe("Jan 14, 2026");
    expect(formatTimeInTimezone(INSTANT, "Asia/Karachi")).toBe("5:30 AM");
    expect(formatTimeInTimezone(INSTANT, "America/New_York")).toBe("7:30 PM");
    expect(formatDateTimeInTimezone(INSTANT, "Asia/Karachi")).toContain("Jan 15, 2026");
    expect(formatDateTimeInTimezone(INSTANT, "Asia/Karachi")).toContain("5:30 AM");
  });

  it("fails open to UTC on a bad zone and to empty on a bad date", () => {
    expect(formatDateInTimezone(INSTANT, "Mars/Olympus")).toBe("Jan 15");
    expect(formatDateInTimezone("not-a-date", "Asia/Karachi")).toBe("");
  });
});
