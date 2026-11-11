import { describe, it, expect } from "vitest";
import {
  parseMessagesQuery,
  buildMessagesFilter,
  adminReplySchema,
  adminMessageStatusSchema,
  buildReplySubject,
  buildReplyEmailHtml,
  serializeMessage,
} from "@/lib/admin-messages";

function params(q: Record<string, string>) {
  return new URLSearchParams(q);
}

describe("parseMessagesQuery", () => {
  it("defaults to page 1, limit 20, no filters", () => {
    expect(parseMessagesQuery(params({}))).toEqual({
      page: 1,
      limit: 20,
      search: "",
      status: "",
      topic: "",
    });
  });

  it("clamps page below 1 to 1 and non-numeric page to 1", () => {
    expect(parseMessagesQuery(params({ page: "0" })).page).toBe(1);
    expect(parseMessagesQuery(params({ page: "-3" })).page).toBe(1);
    expect(parseMessagesQuery(params({ page: "abc" })).page).toBe(1);
  });

  it("clamps limit to 1..100 and falls back on garbage", () => {
    expect(parseMessagesQuery(params({ limit: "500" })).limit).toBe(100);
    expect(parseMessagesQuery(params({ limit: "0" })).limit).toBe(1);
    expect(parseMessagesQuery(params({ limit: "nope" })).limit).toBe(20);
  });

  it("accepts valid status and topic, ignores unknown ones", () => {
    const ok = parseMessagesQuery(params({ status: "replied", topic: "bug" }));
    expect(ok.status).toBe("replied");
    expect(ok.topic).toBe("bug");
    const bad = parseMessagesQuery(params({ status: "deleted", topic: "spam" }));
    expect(bad.status).toBe("");
    expect(bad.topic).toBe("");
  });

  it("trims the search term", () => {
    expect(parseMessagesQuery(params({ search: "  ada@example.com " })).search).toBe("ada@example.com");
  });
});

describe("buildMessagesFilter", () => {
  it("returns an empty filter with no query", () => {
    expect(buildMessagesFilter({ search: "", status: "", topic: "" })).toEqual({});
  });

  it("filters by status and topic", () => {
    expect(buildMessagesFilter({ search: "", status: "closed", topic: "billing" })).toEqual({
      status: "closed",
      topic: "billing",
    });
  });

  it("searches name and email case-insensitively", () => {
    const filter = buildMessagesFilter({ search: "ada", status: "", topic: "" });
    expect(filter.$or).toEqual([
      { name: { $regex: "ada", $options: "i" } },
      { email: { $regex: "ada", $options: "i" } },
    ]);
  });

  it("escapes regex metacharacters in the search term", () => {
    const filter = buildMessagesFilter({ search: "a.c+test@example.com", status: "", topic: "" });
    const or = filter.$or as Array<{ name?: { $regex?: string } }>;
    // A literal dot must not become a wildcard.
    expect(or[0].name?.$regex).toBe("a\\.c\\+test@example\\.com");
    // The escaped pattern only matches the literal string.
    expect(new RegExp(or[0].name!.$regex!).test("a.c+test@example.com")).toBe(true);
    expect(new RegExp(or[0].name!.$regex!).test("axcYtest@example.com")).toBe(false);
  });
});

describe("adminReplySchema", () => {
  it("accepts a normal reply and trims it", () => {
    const parsed = adminReplySchema.safeParse({ message: "  Thanks for writing in.  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.message).toBe("Thanks for writing in.");
  });

  it("rejects empty and too-long replies", () => {
    expect(adminReplySchema.safeParse({ message: "   " }).success).toBe(false);
    expect(adminReplySchema.safeParse({ message: "x".repeat(5001) }).success).toBe(false);
    expect(adminReplySchema.safeParse({ message: "x".repeat(5000) }).success).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(adminReplySchema.safeParse({ message: "hi", extra: 1 }).success).toBe(false);
  });
});

describe("adminMessageStatusSchema", () => {
  it("accepts any of the three statuses", () => {
    for (const status of ["new", "replied", "closed"]) {
      expect(adminMessageStatusSchema.safeParse({ messageId: "abc", status }).success).toBe(true);
    }
  });

  it("rejects unknown statuses and a missing id", () => {
    expect(adminMessageStatusSchema.safeParse({ messageId: "abc", status: "deleted" }).success).toBe(false);
    expect(adminMessageStatusSchema.safeParse({ messageId: "", status: "new" }).success).toBe(false);
  });
});

describe("buildReplySubject", () => {
  it("threads on the topic label", () => {
    expect(buildReplySubject("billing")).toBe("Re: Billing & plans — GetProfitCalc support");
    expect(buildReplySubject("bug")).toBe("Re: A bug or a wrong number — GetProfitCalc support");
    expect(buildReplySubject("feature-request")).toBe("Re: Feature request — GetProfitCalc support");
  });
});

describe("buildReplyEmailHtml", () => {
  it("includes the reply and quotes the original message", () => {
    const html = buildReplyEmailHtml({
      name: "Ada",
      topic: "bug",
      originalMessage: "My profit number looks wrong.",
      reply: "We fixed it — please check again.",
    });
    expect(html).toContain("Hi Ada,");
    expect(html).toContain("We fixed it — please check again.");
    expect(html).toContain("My profit number looks wrong.");
    expect(html).toContain("A bug or a wrong number");
  });

  it("escapes HTML in the name, reply and original message", () => {
    const html = buildReplyEmailHtml({
      name: "<img src=x onerror=alert(1)>",
      topic: "other",
      originalMessage: "<script>alert(1)</script>",
      reply: "a <b>bold</b> move",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("turns newlines into <br/>", () => {
    const html = buildReplyEmailHtml({
      name: "Ada",
      topic: "other",
      originalMessage: "line one\nline two",
      reply: "first\nsecond",
    });
    expect(html).toContain("first<br/>second");
    expect(html).toContain("line one<br/>line two");
  });
});

describe("serializeMessage", () => {
  it("stringifies ids and dates and nulls a missing userId", () => {
    const row = serializeMessage({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      name: "Ada",
      email: "ada@example.com",
      topic: "billing",
      message: "Hello",
      userAgent: "Mozilla/5.0",
      status: "new",
      emailSent: true,
      createdAt: new Date("2026-11-11T10:00:00.000Z"),
      updatedAt: new Date("2026-11-11T10:00:00.000Z"),
    });
    expect(row.id).toBe("507f1f77bcf86cd799439011");
    expect(row.createdAt).toBe("2026-11-11T10:00:00.000Z");
    expect(row.userId).toBeNull();
    expect(row.userAgent).toBe("Mozilla/5.0");
  });

  it("keeps a present userId as a string", () => {
    const row = serializeMessage({
      _id: "abc",
      name: "Ada",
      email: "ada@example.com",
      topic: "other",
      message: "Hello",
      userId: { toString: () => "507f1f77bcf86cd799439012" },
      status: "replied",
      emailSent: false,
      createdAt: "2026-11-11T10:00:00.000Z",
      updatedAt: "2026-11-11T10:00:00.000Z",
    });
    expect(row.userId).toBe("507f1f77bcf86cd799439012");
    expect(row.userAgent).toBeNull();
  });
});
