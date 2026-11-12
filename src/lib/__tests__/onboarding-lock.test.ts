/**
 * Onboarding lock — write-once enforcement, modal trigger, and prefill.
 * Pure logic; the PATCH /api/user route itself is not importable in
 * vitest (its auth chain pulls in next/server), so the route delegates
 * to these helpers and the tests cover the decision here.
 */
import { describe, it, expect } from "vitest";
import {
  decideLockedUpdate,
  needsOnboardingModal,
  resolveOnboardingPrefill,
} from "@/lib/onboarding-lock";
import { isValidTimezone, getSupportedTimezones } from "@/lib/timezones";

describe("isValidTimezone", () => {
  it("accepts real IANA zones and UTC", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Asia/Karachi")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("America/Argentina/Buenos_Aires")).toBe(true);
  });

  it("rejects non-zones, wrong shapes, and non-strings", () => {
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("Not A Zone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("GMT+5")).toBe(false);
    expect(isValidTimezone("Asia/Karachi ")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
    expect(isValidTimezone(123)).toBe(false);
  });

  it("lists real zones (Asia/Karachi included)", () => {
    const zones = getSupportedTimezones();
    expect(zones.length).toBeGreaterThan(100);
    expect(zones).toContain("Asia/Karachi");
    expect(zones).toContain("UTC");
  });
});

describe("decideLockedUpdate", () => {
  it("allows the first write of both fields while unset", () => {
    expect(
      decideLockedUpdate(
        { displayCurrency: null, timezone: null },
        { displayCurrency: "PKR", timezone: "Asia/Karachi" },
      ),
    ).toEqual({ ok: true });
  });

  it("allows name/phone-only requests (no locked field sent)", () => {
    expect(
      decideLockedUpdate(
        { displayCurrency: "PKR", timezone: "Asia/Karachi" },
        {},
      ),
    ).toEqual({ ok: true });
  });

  it("rejects changing a set currency, even to the same value", () => {
    expect(
      decideLockedUpdate(
        { displayCurrency: "PKR", timezone: null },
        { displayCurrency: "PKR" },
      ),
    ).toEqual({
      ok: false,
      code: "CURRENCY_LOCKED",
      message: expect.stringContaining("cannot be changed"),
    });
    expect(
      decideLockedUpdate(
        { displayCurrency: "PKR", timezone: null },
        { displayCurrency: "EUR" },
      ),
    ).toMatchObject({ ok: false, code: "CURRENCY_LOCKED" });
  });

  it("rejects clearing a set currency (null is a write, not a no-op)", () => {
    expect(
      decideLockedUpdate(
        { displayCurrency: "PKR", timezone: null },
        { displayCurrency: null },
      ),
    ).toMatchObject({ ok: false, code: "CURRENCY_LOCKED" });
  });

  it("rejects changing a set timezone", () => {
    expect(
      decideLockedUpdate(
        { displayCurrency: null, timezone: "Asia/Karachi" },
        { timezone: "Europe/London" },
      ),
    ).toMatchObject({ ok: false, code: "TIMEZONE_LOCKED" });
  });

  it("allows clearing an unset currency (null when nothing is stored)", () => {
    expect(
      decideLockedUpdate({ displayCurrency: null, timezone: null }, { displayCurrency: null }),
    ).toEqual({ ok: true });
  });

  it("checks currency first when both fields are locked", () => {
    expect(
      decideLockedUpdate(
        { displayCurrency: "PKR", timezone: "Asia/Karachi" },
        { displayCurrency: "EUR", timezone: "Europe/London" },
      ),
    ).toMatchObject({ ok: false, code: "CURRENCY_LOCKED" });
  });
});

describe("needsOnboardingModal", () => {
  it("shows for a user with a team whose flag is false", () => {
    expect(needsOnboardingModal({ onboardingCompleted: false, teamId: "t1" })).toBe(true);
  });

  it("shows when the flag is missing (old JWTs predate the field)", () => {
    expect(needsOnboardingModal({ onboardingCompleted: undefined, teamId: "t1" })).toBe(true);
    expect(needsOnboardingModal({ teamId: "t1" })).toBe(true);
  });

  it("never shows once the flag is true", () => {
    expect(needsOnboardingModal({ onboardingCompleted: true, teamId: "t1" })).toBe(false);
  });

  it("never shows without a team (user is on /onboarding, not the dashboard)", () => {
    expect(needsOnboardingModal({ onboardingCompleted: false, teamId: null })).toBe(false);
    expect(needsOnboardingModal({ onboardingCompleted: false })).toBe(false);
  });
});

describe("resolveOnboardingPrefill", () => {
  it("prefills a brand-new user from geo currency + browser timezone", () => {
    expect(
      resolveOnboardingPrefill({
        displayCurrency: null,
        timezone: null,
        teamTimezone: "UTC",
        teamCurrency: "USD",
        detectedCurrency: "PKR",
        browserTimezone: "Asia/Karachi",
      }),
    ).toEqual({
      currencyLocked: false,
      currencyDefault: "PKR",
      timezoneLocked: false,
      // Team timezone (UTC) seeds the timezone before the browser one.
      timezoneDefault: "UTC",
      timezonePrefillFromTeam: true,
    });
  });

  it("falls back to the browser timezone when the team has none usable", () => {
    const p = resolveOnboardingPrefill({
      displayCurrency: null,
      timezone: null,
      teamTimezone: "Not/AZone",
      detectedCurrency: null,
      teamCurrency: "USD",
      browserTimezone: "Europe/London",
    });
    expect(p.timezoneDefault).toBe("Europe/London");
    expect(p.timezonePrefillFromTeam).toBe(false);
    expect(p.currencyDefault).toBe("USD");
  });

  it("locks the currency for a grandfathered user and prefills timezone from the team", () => {
    const p = resolveOnboardingPrefill({
      displayCurrency: "EUR",
      timezone: null,
      teamTimezone: "Europe/Berlin",
      teamCurrency: "USD",
      detectedCurrency: "PKR",
      browserTimezone: "Asia/Karachi",
    });
    expect(p.currencyLocked).toBe(true);
    expect(p.currencyDefault).toBe("EUR");
    expect(p.timezoneLocked).toBe(false);
    expect(p.timezoneDefault).toBe("Europe/Berlin");
    expect(p.timezonePrefillFromTeam).toBe(true);
  });

  it("keeps both locked values when both are already set", () => {
    const p = resolveOnboardingPrefill({
      displayCurrency: "GBP",
      timezone: "Europe/London",
      teamTimezone: "UTC",
      detectedCurrency: "PKR",
      browserTimezone: "Asia/Karachi",
    });
    expect(p).toEqual({
      currencyLocked: true,
      currencyDefault: "GBP",
      timezoneLocked: true,
      timezoneDefault: "Europe/London",
      timezonePrefillFromTeam: false,
    });
  });
});
