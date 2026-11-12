import { describe, it, expect } from "vitest";
import {
  DETECTED_CURRENCY_TTL_MS,
  parseDetectedCache,
  serializeDetected,
  type DetectedCurrency,
} from "@/lib/geo-detection";

// Fixed "now" so the TTL boundary is deterministic.
const NOW = 1_800_000_000_000;

const PKR: DetectedCurrency = { code: "PKR", country: "PK", source: "vercel-geo" };

describe("parseDetectedCache", () => {
  it("trusts a fresh detection", () => {
    const { fresh, stale } = parseDetectedCache(serializeDetected(PKR, NOW), NOW);
    expect(fresh).toEqual(PKR);
    expect(stale).toBeNull();
  });

  it("trusts a detection recorded exactly at the TTL boundary", () => {
    const { fresh, stale } = parseDetectedCache(
      serializeDetected(PKR, NOW - DETECTED_CURRENCY_TTL_MS),
      NOW,
    );
    expect(fresh).toEqual(PKR);
    expect(stale).toBeNull();
  });

  it("marks a detection older than the TTL as stale, not fresh", () => {
    const { fresh, stale } = parseDetectedCache(
      serializeDetected(PKR, NOW - DETECTED_CURRENCY_TTL_MS - 1),
      NOW,
    );
    expect(fresh).toBeNull();
    expect(stale).toEqual(PKR);
  });

  it("treats a pre-TTL entry (no timestamp) as stale — it must re-fetch", () => {
    const { fresh, stale } = parseDetectedCache(JSON.stringify(PKR), NOW);
    expect(fresh).toBeNull();
    expect(stale).toEqual(PKR);
  });

  it("rejects garbage and non-objects", () => {
    expect(parseDetectedCache(null, NOW)).toEqual({ fresh: null, stale: null });
    expect(parseDetectedCache("", NOW)).toEqual({ fresh: null, stale: null });
    expect(parseDetectedCache("not json", NOW)).toEqual({ fresh: null, stale: null });
    expect(parseDetectedCache("[]", NOW)).toEqual({ fresh: null, stale: null });
    expect(parseDetectedCache('"PKR"', NOW)).toEqual({ fresh: null, stale: null });
  });

  it("rejects a code that is not a 3-letter code", () => {
    expect(parseDetectedCache(JSON.stringify({ ...PKR, code: "USDD" }), NOW)).toEqual({
      fresh: null,
      stale: null,
    });
    expect(parseDetectedCache(JSON.stringify({ ...PKR, code: 12 }), NOW)).toEqual({
      fresh: null,
      stale: null,
    });
  });

  it("upper-cases and trims the code", () => {
    const { stale } = parseDetectedCache(JSON.stringify({ ...PKR, code: " pkr " }), NOW);
    expect(stale).toEqual(PKR);
  });

  it("requires the country field to be present", () => {
    const { code, source } = PKR;
    expect(parseDetectedCache(JSON.stringify({ code, source }), NOW)).toEqual({
      fresh: null,
      stale: null,
    });
  });

  it("accepts a null country (older cached shape)", () => {
    const { stale } = parseDetectedCache(
      JSON.stringify({ ...PKR, country: null }),
      NOW,
    );
    expect(stale).toEqual({ ...PKR, country: null });
  });

  it("normalises an unknown source to vercel-geo, keeps language", () => {
    const { stale: weird } = parseDetectedCache(
      JSON.stringify({ ...PKR, source: "weird" }),
      NOW,
    );
    expect(weird?.source).toBe("vercel-geo");
    const { stale: lang } = parseDetectedCache(
      JSON.stringify({ ...PKR, source: "language" }),
      NOW,
    );
    expect(lang?.source).toBe("language");
  });

  it("treats a non-numeric timestamp as stale", () => {
    const { fresh, stale } = parseDetectedCache(
      JSON.stringify({ ...PKR, detectedAt: "yesterday" }),
      NOW,
    );
    expect(fresh).toBeNull();
    expect(stale).toEqual(PKR);
  });
});

describe("serializeDetected", () => {
  it("round-trips through parseDetectedCache as fresh", () => {
    const raw = serializeDetected(PKR, NOW);
    expect(JSON.parse(raw).detectedAt).toBe(NOW);
    expect(parseDetectedCache(raw, NOW).fresh).toEqual(PKR);
  });
});
