import { describe, it, expect } from "vitest";
import { toIsoDateTime, isoDateTimeField, parseDateRange } from "@/lib/dates";

const NOW = new Date("2026-11-13T12:00:00.000Z");

describe("toIsoDateTime", () => {
  it("turns a calendar date into midnight UTC", () => {
    expect(toIsoDateTime("2026-11-11")).toBe("2026-11-11T00:00:00.000Z");
  });

  it("passes a full ISO datetime through, normalized to UTC", () => {
    expect(toIsoDateTime("2026-11-11T10:30:00.000Z")).toBe("2026-11-11T10:30:00.000Z");
    expect(toIsoDateTime("2026-11-11T10:30:00+05:00")).toBe("2026-11-11T05:30:00.000Z");
  });

  it("throws RangeError for unparseable input", () => {
    expect(() => toIsoDateTime("not-a-date")).toThrow(RangeError);
    expect(() => toIsoDateTime("")).toThrow(RangeError);
  });
});

describe("isoDateTimeField — the create-order schema field", () => {
  it("accepts a calendar date and normalizes it to midnight UTC", () => {
    const parsed = isoDateTimeField.safeParse("2026-11-11");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("2026-11-11T00:00:00.000Z");
  });

  it("still accepts a full ISO datetime unchanged", () => {
    const parsed = isoDateTimeField.safeParse("2026-11-11T10:30:00.000Z");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("2026-11-11T10:30:00.000Z");
  });

  it("still rejects garbage with the field error", () => {
    const parsed = isoDateTimeField.safeParse("not-a-date");
    expect(parsed.success).toBe(false);
  });
});

describe("parseDateRange — P&L ?from=/?to= validation (N-1)", () => {
  const defaultFrom = new Date(NOW.getFullYear(), NOW.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = NOW.toISOString().slice(0, 10);

  it("keeps valid calendar dates and puts `to` at end of day", () => {
    const { from, to } = parseDateRange("2026-10-05", "2026-10-20", NOW);
    expect(from.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(to.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
    expect(to.getMilliseconds()).toBe(999);
  });

  it("falls back to the default range for garbage instead of an Invalid Date", () => {
    const { from, to } = parseDateRange("not-a-date", "xyz", NOW);
    expect(Number.isNaN(from.getTime())).toBe(false);
    expect(Number.isNaN(to.getTime())).toBe(false);
    expect(from.toISOString().slice(0, 10)).toBe(defaultFrom);
    expect(to.toISOString().slice(0, 10)).toBe(defaultTo);
  });

  it("treats an empty-string param as garbage (falls back), not as a date", () => {
    const { from } = parseDateRange("", undefined, NOW);
    expect(from.toISOString().slice(0, 10)).toBe(defaultFrom);
  });

  it("falls back only the bad end when the other end is valid", () => {
    const { from, to } = parseDateRange("2026-10-05", "garbage", NOW);
    expect(from.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(to.toISOString().slice(0, 10)).toBe(defaultTo);
  });

  it("defaults both ends when nothing is passed", () => {
    const { from, to } = parseDateRange(undefined, undefined, NOW);
    expect(from.toISOString().slice(0, 10)).toBe(defaultFrom);
    expect(to.toISOString().slice(0, 10)).toBe(defaultTo);
  });

  it("returns a valid-but-reversed range as-is (empty results downstream, not a 500)", () => {
    const { from, to } = parseDateRange("2026-11-10", "2026-11-01", NOW);
    expect(from.getTime()).toBeGreaterThan(to.getTime());
  });
});
