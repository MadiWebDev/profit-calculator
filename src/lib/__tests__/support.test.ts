import { describe, it, expect } from "vitest";
import {
  buildSupportEmailHtml,
  isHoneypotFilled,
  validateSupportSubmission,
} from "@/lib/support";

const valid = {
  name: "Aisha Khan",
  email: "aisha@example.com",
  topic: "billing",
  message: "My trial ended yesterday and the dashboard is locked — I want to upgrade to Growth.",
  website: "",
} as const;

describe("validateSupportSubmission", () => {
  it("accepts a complete, valid submission", () => {
    const parsed = validateSupportSubmission({ ...valid });
    expect(parsed.success).toBe(true);
  });

  it("rejects a bad email, a short message, and an unknown topic", () => {
    expect(validateSupportSubmission({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(validateSupportSubmission({ ...valid, message: "help!" }).success).toBe(false);
    expect(validateSupportSubmission({ ...valid, topic: "refund-me-now" }).success).toBe(false);
    expect(validateSupportSubmission({ ...valid, name: "A" }).success).toBe(false);
  });

  it("rejects extra fields (strict schema)", () => {
    expect(validateSupportSubmission({ ...valid, admin: true }).success).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(validateSupportSubmission(null).success).toBe(false);
    expect(validateSupportSubmission("hello").success).toBe(false);
  });
});

describe("isHoneypotFilled", () => {
  it("is false for a human submission and true when the trap field is filled", () => {
    expect(isHoneypotFilled({ ...valid, website: "" })).toBe(false);
    expect(isHoneypotFilled({ ...valid, website: "http://spam.example" })).toBe(true);
    expect(isHoneypotFilled({ ...valid, website: "   " })).toBe(false);
  });
});

describe("buildSupportEmailHtml", () => {
  it("escapes HTML in every user-supplied field", () => {
    const html = buildSupportEmailHtml({
      ...valid,
      name: "<script>alert(1)</script>",
      message: "a < b & \"quoted\"",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &lt; b &amp; &quot;quoted&quot;");
    expect(html).toContain("aisha@example.com");
    expect(html).toContain("Billing &amp; plans");
  });
});
