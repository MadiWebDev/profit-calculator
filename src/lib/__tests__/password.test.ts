/**
 * Tests for the password policy + HIBP breach check (Phase 4).
 * The HIBP network call is mocked; fail-open behavior is asserted.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkPasswordPolicy, isPasswordBreached } from "@/lib/password";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkPasswordPolicy", () => {
  it("rejects short passwords", () => {
    expect(checkPasswordPolicy("Ab1!")).toEqual({
      ok: false,
      reason: expect.stringContaining("10 characters"),
    });
  });

  it("rejects passwords without a letter", () => {
    expect(checkPasswordPolicy("1234567890!").ok).toBe(false);
  });

  it("rejects passwords without a number or symbol", () => {
    expect(checkPasswordPolicy("abcdefghij").ok).toBe(false);
  });

  it("accepts a compliant password", () => {
    expect(checkPasswordPolicy("correct-horse-9")).toEqual({ ok: true });
  });

  it("rejects overlong passwords", () => {
    expect(checkPasswordPolicy(`a1!${"x".repeat(126)}`).ok).toBe(false);
  });
});

describe("isPasswordBreached", () => {
  it("returns true when the HIBP range contains the suffix", async () => {
    const { createHash } = await import("crypto");
    const sha1 = createHash("sha1").update("password").digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain(prefix);
        expect(url).not.toContain(suffix); // k-anonymity: only prefix leaves the box
        return new Response(`${suffix}:42\nOTHERHASH:3`);
      })
    );
    expect(await isPasswordBreached("password")).toBe(true);
  });

  it("returns false when the suffix is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("OTHERHASH:3")));
    expect(await isPasswordBreached("a-very-unlikely-breached-pw-9!")).toBe(false);
  });

  it("fails open on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    expect(await isPasswordBreached("anything-9!")).toBe(false);
  });
});
