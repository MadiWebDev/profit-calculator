/**
 * Phase 5: Meta sync hardening helpers — pure functions, offline tests.
 */
import { describe, it, expect } from "vitest";
import {
  parseUtmFromLandingSite,
  buildTokenExchangeUrl,
  parseTokenExchangeResponse,
  dateInTimezone,
  resolveSyncWindow,
  shouldRetryMetaError,
  backoffMs,
} from "@/lib/meta-ads-hardening";

describe("parseUtmFromLandingSite", () => {
  it("parses source and campaign from a landing URL", () => {
    expect(
      parseUtmFromLandingSite("https://shop.example/products/x?utm_source=facebook&utm_campaign=summer_sale&utm_medium=cpc")
    ).toEqual({ utmSource: "facebook", utmCampaign: "summer_sale" });
  });
  it("returns {} for missing, relative, or garbage URLs", () => {
    expect(parseUtmFromLandingSite(undefined)).toEqual({});
    expect(parseUtmFromLandingSite("not a url")).toEqual({});
    expect(parseUtmFromLandingSite("https://shop.example/")).toEqual({});
  });
  it("returns only the params present", () => {
    expect(parseUtmFromLandingSite("https://shop.example/?utm_source=instagram")).toEqual({
      utmSource: "instagram",
    });
  });
});

describe("token exchange", () => {
  it("builds the fb_exchange_token URL without leaking the secret into the path", () => {
    const url = buildTokenExchangeUrl("app1", "sec1", "tok1");
    expect(url).toContain("grant_type=fb_exchange_token");
    expect(url).toContain("client_id=app1");
    expect(url).toContain("fb_exchange_token=tok1");
  });
  it("parses a success response and throws on an error payload", () => {
    expect(parseTokenExchangeResponse({ access_token: "abc", expires_in: 5184000 })).toEqual({
      accessToken: "abc",
      expiresIn: 5184000,
    });
    expect(() => parseTokenExchangeResponse({ error: { message: "bad token", code: 190 } })).toThrow(
      /token exchange failed/
    );
    expect(() => parseTokenExchangeResponse({})).toThrow(/missing access_token/);
  });
});

describe("dateInTimezone", () => {
  it("shifts the calendar date into the account timezone", () => {
    // 2026-10-25T01:00Z is still 2026-10-24 in New York.
    expect(dateInTimezone(new Date("2026-10-25T01:00:00.000Z"), "America/New_York")).toBe("2026-10-24");
    expect(dateInTimezone(new Date("2026-10-25T01:00:00.000Z"), "Asia/Karachi")).toBe("2026-10-25");
  });
  it("falls back to UTC for an unknown timezone", () => {
    expect(dateInTimezone(new Date("2026-10-25T01:00:00.000Z"), "Not/AZone")).toBe("2026-10-25");
  });
});

describe("resolveSyncWindow", () => {
  const now = new Date("2026-10-25T12:00:00.000Z");
  it("explicit lookback wins", () => {
    const w = resolveSyncWindow({ lookbackDays: 7, now });
    expect(w.mode).toBe("full");
    expect(w.startDate.toISOString()).toBe("2026-10-18T12:00:00.000Z");
  });
  it("incremental window starts 3 days before last sync (repull tail)", () => {
    const w = resolveSyncWindow({ lastSyncAt: new Date("2026-10-24T12:00:00.000Z"), now });
    expect(w.mode).toBe("incremental");
    expect(w.startDate.toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });
  it("first sync pulls 30 days", () => {
    const w = resolveSyncWindow({ now });
    expect(w.mode).toBe("full");
    expect(w.startDate.toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });
});

describe("shouldRetryMetaError / backoffMs", () => {
  it("retries 429, 5xx and Meta rate-limit codes only", () => {
    expect(shouldRetryMetaError({ status: 429 })).toBe(true);
    expect(shouldRetryMetaError({ status: 503 })).toBe(true);
    expect(shouldRetryMetaError({ status: 200, code: 17 })).toBe(true);
    expect(shouldRetryMetaError({ status: 400, code: 190 })).toBe(false);
    expect(shouldRetryMetaError({ status: 400 })).toBe(false);
  });
  it("backs off exponentially, capped at 30s", () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(10)).toBe(30000);
  });
});
