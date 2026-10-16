/**
 * Cron auth tests — Phase 6.
 * Verifies the timing-safe bearer comparison and failure modes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyCronAuth } from "@/lib/cron-auth";

const SECRET = "test-cron-secret-12345";

function reqWith(authHeader?: string): Request {
  return new Request("https://example.com/api/cron/x", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("verifyCronAuth", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("accepts the correct bearer token", () => {
    expect(verifyCronAuth(reqWith(`Bearer ${SECRET}`))).toBeNull();
  });

  it("rejects a wrong token", async () => {
    const res = verifyCronAuth(reqWith("Bearer wrong-secret-value!!"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects a missing header", () => {
    const res = verifyCronAuth(reqWith());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects a non-bearer scheme", () => {
    const res = verifyCronAuth(reqWith(`Basic ${SECRET}`));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects a prefix of the secret (length check before timingSafeEqual)", () => {
    const res = verifyCronAuth(reqWith(`Bearer ${SECRET.slice(0, 5)}`));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("500s when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;
    const res = verifyCronAuth(reqWith(`Bearer ${SECRET}`));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });
});
