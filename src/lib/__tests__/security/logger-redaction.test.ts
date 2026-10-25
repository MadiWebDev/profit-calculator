import { describe, it, expect } from "vitest";
import { redact } from "@/lib/logger";

describe("Logger redaction (R11)", () => {
  it("redacts sensitive keys and secret-shaped free text, keeps normal data", () => {
    const out = redact({
      orderId: "507f1f77bcf86cd799439011", // 24-hex ObjectId: kept
      accessToken: "should-not-appear",
      note: "called with Bearer abc.def.ghi and key sk_live_abcdefgh12345678",
      nested: { password: "hunter2", amount: 42 },
    }) as Record<string, unknown>;
    expect(out.orderId).toBe("507f1f77bcf86cd799439011");
    expect(out.accessToken).toBe("[REDACTED]");
    expect(String(out.note)).not.toContain("abc.def.ghi");
    expect(String(out.note)).not.toContain("sk_live_abcdefgh12345678");
    expect((out.nested as Record<string, unknown>).password).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).amount).toBe(42);
    const hex64 = "a".repeat(64);
    expect(redact(`token ${hex64}`)).not.toContain(hex64);
  });
});
