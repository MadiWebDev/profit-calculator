/**
 * Ad-spend date ranges + sync backfill — unit tests (pure helpers).
 *
 * Covers the ?days= validation, the incremental/backfill window math,
 * and the mock fixture generator for explicit date ranges. The
 * end-to-end backfill (mock sync → stored rows → tracker) is proven
 * by the Playwright smoke test, not here.
 */
import "./setup-env";
import { describe, it, expect } from "vitest";
import {
  AD_SPEND_DAY_OPTIONS,
  parseAdSpendDays,
  computeIncrementalWindow,
  computeBackfillGap,
  splitDateRange,
  MAX_BACKFILL_DAYS,
  BACKFILL_CHUNK_DAYS,
} from "@/lib/sync/ad-spend-days";
import { mockSpendRowsForRange } from "@/lib/ads/mock";

const DAY = 864e5;
const NOW = new Date("2026-10-25T12:00:00.000Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("parseAdSpendDays", () => {
  it("accepts exactly the offered ranges", () => {
    for (const d of AD_SPEND_DAY_OPTIONS) {
      expect(parseAdSpendDays(String(d))).toBe(d);
    }
  });

  it("falls back to 30 for anything else", () => {
    expect(parseAdSpendDays(undefined)).toBe(30);
    expect(parseAdSpendDays(null)).toBe(30);
    expect(parseAdSpendDays("")).toBe(30);
    expect(parseAdSpendDays("abc")).toBe(30);
    expect(parseAdSpendDays("999")).toBe(30);
    expect(parseAdSpendDays("0")).toBe(30);
    expect(parseAdSpendDays("-30")).toBe(30);
    expect(parseAdSpendDays("29")).toBe(30);
    expect(parseAdSpendDays("366")).toBe(30);
  });
});

describe("computeIncrementalWindow", () => {
  it("explicit lookback wins", () => {
    const w = computeIncrementalWindow({ lookbackDays: 90, now: NOW });
    expect(w.mode).toBe("full");
    expect(iso(w.startDate)).toBe("2026-07-27");
  });

  it("incremental window starts 3 days before last sync", () => {
    const w = computeIncrementalWindow({
      lastSyncAt: new Date("2026-10-24T12:00:00.000Z"),
      now: NOW,
    });
    expect(w.mode).toBe("incremental");
    expect(iso(w.startDate)).toBe("2026-10-21");
  });

  it("first sync pulls 30 days", () => {
    const w = computeIncrementalWindow({ now: NOW });
    expect(w.mode).toBe("full");
    expect(iso(w.startDate)).toBe("2026-09-25");
  });
});

describe("computeBackfillGap", () => {
  it("no coverage at all -> full 365-day gap", () => {
    const gap = computeBackfillGap({ now: NOW });
    expect(gap).not.toBeNull();
    expect(iso(gap!.startDate)).toBe("2025-10-25");
    expect(iso(gap!.endDate)).toBe("2026-10-25");
  });

  it("coverage from 30 days ago -> gap up to that date", () => {
    const gap = computeBackfillGap({
      now: NOW,
      coverageStart: new Date("2026-09-25T12:00:00.000Z"),
    });
    expect(gap).not.toBeNull();
    expect(iso(gap!.startDate)).toBe("2025-10-25");
    expect(iso(gap!.endDate)).toBe("2026-09-25");
  });

  it("uses the earlier of tracker and incremental start", () => {
    const gap = computeBackfillGap({
      now: NOW,
      backfillThrough: new Date("2026-09-01T00:00:00.000Z"),
      coverageStart: new Date("2026-10-20T12:00:00.000Z"),
    });
    expect(gap).not.toBeNull();
    expect(iso(gap!.endDate)).toBe("2026-09-01");
  });

  it("coverage already reaching 365 days -> no gap", () => {
    expect(
      computeBackfillGap({
        now: NOW,
        backfillThrough: new Date("2025-10-01T00:00:00.000Z"),
      })
    ).toBeNull();
    expect(
      computeBackfillGap({
        now: NOW,
        coverageStart: new Date("2025-10-25T00:00:00.000Z"),
      })
    ).toBeNull();
  });

  it("max backfill is 365 days", () => {
    expect(MAX_BACKFILL_DAYS).toBe(365);
  });
});

describe("splitDateRange", () => {
  it("splits a 335-day gap into 12 chunks of at most 30 days, newest first", () => {
    const chunks = splitDateRange(
      new Date("2025-10-25T00:00:00.000Z"),
      new Date("2026-09-25T00:00:00.000Z")
    );
    expect(chunks.length).toBe(12);
    // Newest first: first chunk ends at the gap end, last starts at the gap start.
    expect(iso(chunks[0].endDate)).toBe("2026-09-25");
    expect(iso(chunks[11].startDate)).toBe("2025-10-25");
    for (const c of chunks) {
      const spanDays = Math.round((c.endDate.getTime() - c.startDate.getTime()) / DAY);
      expect(spanDays).toBeLessThanOrEqual(BACKFILL_CHUNK_DAYS);
      expect(spanDays).toBeGreaterThan(0);
    }
    // Contiguous: each chunk starts where the next one ends (shared boundary day).
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].startDate.getTime()).toBe(chunks[i + 1].endDate.getTime());
    }
    // Starts strictly descend (newest first).
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].startDate.getTime()).toBeGreaterThan(chunks[i + 1].startDate.getTime());
    }
  });

  it("a 30-day range is a single chunk; 31 days is two", () => {
    const one = splitDateRange(
      new Date("2026-09-25T00:00:00.000Z"),
      new Date("2026-10-25T00:00:00.000Z")
    );
    expect(one.length).toBe(1);
    const two = splitDateRange(
      new Date("2026-09-24T00:00:00.000Z"),
      new Date("2026-10-25T00:00:00.000Z")
    );
    expect(two.length).toBe(2);
  });

  it("empty or inverted range -> no chunks", () => {
    expect(splitDateRange(new Date("2026-10-25"), new Date("2026-10-25"))).toEqual([]);
    expect(splitDateRange(new Date("2026-10-26"), new Date("2026-10-25"))).toEqual([]);
  });
});

describe("mockSpendRowsForRange", () => {
  it("generates 2 campaigns per day inside the range only", () => {
    const rows = mockSpendRowsForRange(
      "acct-1",
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-10-03T00:00:00.000Z")
    );
    expect(rows.length).toBe(6);
    for (const r of rows) {
      expect(r.date >= "2026-10-01" && r.date <= "2026-10-03").toBe(true);
      expect(r.spend).toBeGreaterThan(0);
    }
  });

  it("is deterministic per account and range", () => {
    const a = mockSpendRowsForRange(
      "acct-1",
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-05T00:00:00.000Z")
    );
    const b = mockSpendRowsForRange(
      "acct-1",
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-05T00:00:00.000Z")
    );
    const c = mockSpendRowsForRange(
      "acct-2",
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-05T00:00:00.000Z")
    );
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
