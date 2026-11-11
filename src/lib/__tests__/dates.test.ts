import { describe, it, expect } from "vitest";
import { toIsoDateTime, isoDateTimeField } from "@/lib/dates";

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
