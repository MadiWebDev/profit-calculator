import { describe, it, expect } from "vitest";
import {
  isSessionExpired,
  requiresTwoFactorSetup,
  SESSION_ABSOLUTE_MAX_AGE_SEC,
  SESSION_IDLE_TIMEOUT_SEC,
} from "@/lib/session-policy";

describe("isSessionExpired", () => {
  const now = Date.now();
  it("expires past the 30-day absolute cap even with recent activity", () => {
    expect(isSessionExpired({
      iatSec: now / 1000 - SESSION_ABSOLUTE_MAX_AGE_SEC - 60,
      lastSeenMs: now,
      nowMs: now,
    })).toBe(true);
  });
  it("keeps a fresh, active session", () => {
    expect(isSessionExpired({
      iatSec: now / 1000 - 3600,
      lastSeenMs: now - 3600 * 1000,
      nowMs: now,
    })).toBe(false);
  });
  it("expires after 7 days idle even within the absolute cap", () => {
    expect(isSessionExpired({
      iatSec: now / 1000 - 3600,
      lastSeenMs: now - (SESSION_IDLE_TIMEOUT_SEC + 60) * 1000,
      nowMs: now,
    })).toBe(true);
  });
  it("does not expire on missing activity data (fail-open, like the DB check)", () => {
    expect(isSessionExpired({ iatSec: now / 1000 - 60, lastSeenMs: null, nowMs: now })).toBe(false);
  });
});

describe("requiresTwoFactorSetup", () => {
  it("requires setup for owner/admin without 2FA when the team requires it", () => {
    expect(requiresTwoFactorSetup({ twoFactorRequiredForAdmins: true, teamRole: "owner", twoFactorEnabled: false })).toBe(true);
    expect(requiresTwoFactorSetup({ twoFactorRequiredForAdmins: true, teamRole: "admin", twoFactorEnabled: false })).toBe(true);
  });
  it("does not require setup for members/viewers, enabled users, or opt-out teams", () => {
    expect(requiresTwoFactorSetup({ twoFactorRequiredForAdmins: true, teamRole: "member", twoFactorEnabled: false })).toBe(false);
    expect(requiresTwoFactorSetup({ twoFactorRequiredForAdmins: true, teamRole: "admin", twoFactorEnabled: true })).toBe(false);
    expect(requiresTwoFactorSetup({ twoFactorRequiredForAdmins: false, teamRole: "owner", twoFactorEnabled: false })).toBe(false);
  });
});
