import { describe, it, expect } from "vitest";
import { escapeRegExp, parsePageParam } from "@/lib/search";

describe("escapeRegExp", () => {
  it("leaves plain text untouched", () => {
    expect(escapeRegExp("order 1001")).toBe("order 1001");
    expect(escapeRegExp("customer@example.com")).toBe("customer@example\\.com");
  });

  it("escapes every regex metacharacter", () => {
    expect(escapeRegExp("[")).toBe("\\[");
    expect(escapeRegExp("(")).toBe("\\(");
    expect(escapeRegExp("a+b*c?d")).toBe("a\\+b\\*c\\?d");
    expect(escapeRegExp("a|b^c$d{e}f")).toBe("a\\|b\\^c\\$d\\{e\\}f");
    expect(escapeRegExp("back\\slash")).toBe("back\\\\slash");
    expect(escapeRegExp("[a-")).toBe("\\[a-"); // "-" needs no escape outside a class
  });

  it("produces a pattern that matches the literal term", () => {
    const term = "[1001] (test)";
    const re = new RegExp(escapeRegExp(term), "i");
    expect(re.test("[1001] (test)")).toBe(true);
    expect(re.test("1001 test")).toBe(false);
  });
});

describe("parsePageParam", () => {
  it("passes valid pages through", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("7")).toBe(7);
    expect(parsePageParam(" 3 ")).toBe(3);
  });

  it("falls back to 1 for missing or non-numeric input", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("NaN")).toBe(1);
  });

  it("clamps zero and negative pages up to 1", () => {
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-1")).toBe(1);
    expect(parsePageParam("-50")).toBe(1);
  });

  it("respects an explicit fallback", () => {
    expect(parsePageParam("abc", 2)).toBe(2);
    expect(parsePageParam("0", 2)).toBe(2);
    expect(parsePageParam("5", 2)).toBe(5);
  });
});
