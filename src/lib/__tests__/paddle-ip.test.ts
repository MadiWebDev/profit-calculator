import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPaddleWebhookIps, isPaddleWebhookIp, getClientIp } from "@/lib/paddle-ip";

describe("paddle-ip verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts client IP from x-forwarded-for header", () => {
    const req = new Request("https://example.com/api/billing/webhook", {
      headers: { "x-forwarded-for": "34.237.3.244, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("34.237.3.244");
  });

  it("extracts client IP from x-real-ip when x-forwarded-for is missing", () => {
    const req = new Request("https://example.com/api/billing/webhook", {
      headers: { "x-real-ip": "34.195.105.136" },
    });
    expect(getClientIp(req)).toBe("34.195.105.136");
  });

  it("extracts client IP from cf-connecting-ip", () => {
    const req = new Request("https://example.com/api/billing/webhook", {
      headers: { "cf-connecting-ip": "52.11.166.252" },
    });
    expect(getClientIp(req)).toBe("52.11.166.252");
  });

  it("returns fallback list when network fetch fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network offline"));
    const ips = await getPaddleWebhookIps();
    expect(ips).toContain("34.237.3.244");
    expect(ips.length).toBeGreaterThanOrEqual(6);
  });

  it("permits local loopback in development / test", async () => {
    const req = new Request("https://example.com/api/billing/webhook", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    });
    const allowed = await isPaddleWebhookIp(req);
    expect(allowed).toBe(true);
  });
});
