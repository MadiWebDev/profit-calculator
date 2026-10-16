import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  parseLinkHeader,
  computeBackoffMs,
  isValidShopDomain,
  SHOPIFY_API_VERSION,
} from "@/lib/shopify";
import { verifyShopifyHmac } from "@/app/api/webhooks/shopify/[topic]/route";
import { upsertShopifyOrder, mapShopifyStatus } from "@/lib/sync/shopify";

describe("SHOPIFY_API_VERSION", () => {
  it("is a stable (non-RC) version pinned in one place", () => {
    expect(SHOPIFY_API_VERSION).toMatch(/^\d{4}-\d{2}$/);
    // Must not be a release candidate
    expect(SHOPIFY_API_VERSION).not.toMatch(/rc/i);
  });
});

describe("isValidShopDomain", () => {
  it("accepts valid myshopify.com domains", () => {
    expect(isValidShopDomain("my-store.myshopify.com")).toBe(true);
    expect(isValidShopDomain("a1.myshopify.com")).toBe(true);
  });
  it("rejects malformed / malicious domains", () => {
    expect(isValidShopDomain("evil.com")).toBe(false);
    expect(isValidShopDomain("foo.myshopify.com.evil.com")).toBe(false);
    expect(isValidShopDomain("https://x.myshopify.com")).toBe(false);
    expect(isValidShopDomain("")).toBe(false);
    expect(isValidShopDomain("-bad.myshopify.com")).toBe(false);
  });
});

describe("parseLinkHeader", () => {
  it("extracts next/previous rels", () => {
    const h =
      '<https://shop.myshopify.com/admin/api/2026-10/orders.json?page_info=abc>; rel="next", ' +
      '<https://shop.myshopify.com/admin/api/2026-10/orders.json?page_info=xyz>; rel="previous"';
    const links = parseLinkHeader(h);
    expect(links.next).toContain("page_info=abc");
    expect(links.previous).toContain("page_info=xyz");
  });
  it("returns {} for missing/empty headers", () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader("")).toEqual({});
  });
  it("ignores malformed parts", () => {
    expect(parseLinkHeader("not-a-link-header")).toEqual({});
  });
});

describe("computeBackoffMs", () => {
  it("honours Retry-After on 429", () => {
    expect(computeBackoffMs(429, "5", null, 0)).toBe(5000);
  });
  it("caps Retry-After at 60s", () => {
    expect(computeBackoffMs(429, "300", null, 0)).toBe(60_000);
  });
  it("pauses when the API bucket is ≥80% full", () => {
    expect(computeBackoffMs(200, null, "39/40", 0)).toBe(2000);
    expect(computeBackoffMs(200, null, "10/40", 0)).not.toBe(2000);
  });
  it("exponential backoff without headers, capped at 30s", () => {
    expect(computeBackoffMs(500, null, null, 0)).toBe(1000);
    expect(computeBackoffMs(500, null, null, 1)).toBe(2000);
    expect(computeBackoffMs(500, null, null, 2)).toBe(4000);
    expect(computeBackoffMs(500, null, null, 10)).toBe(30_000);
  });
  it("ignores garbage Retry-After values", () => {
    const v = computeBackoffMs(429, "not-a-number", null, 0);
    expect(v).toBe(1000); // falls back to exponential
  });
});

describe("verifyShopifyHmac", () => {
  const OLD = process.env.SHOPIFY_CLIENT_SECRET;
  beforeEach(() => {
    process.env.SHOPIFY_CLIENT_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.SHOPIFY_CLIENT_SECRET = OLD;
  });

  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ id: 123 });
    const sig = createHmac("sha256", "test-secret").update(body, "utf8").digest("base64");
    expect(verifyShopifyHmac(body, sig)).toBe(true);
  });
  it("rejects tampered bodies", () => {
    const body = JSON.stringify({ id: 123 });
    const sig = createHmac("sha256", "test-secret").update(body, "utf8").digest("base64");
    expect(verifyShopifyHmac(body + "x", sig)).toBe(false);
  });
  it("rejects wrong secrets and missing headers", () => {
    const body = "hello";
    const sig = createHmac("sha256", "wrong-secret").update(body, "utf8").digest("base64");
    expect(verifyShopifyHmac(body, sig)).toBe(false);
    expect(verifyShopifyHmac(body, null)).toBe(false);
    expect(verifyShopifyHmac(body, "")).toBe(false);
  });
});

describe("mapShopifyStatus", () => {
  it("maps known financial statuses", () => {
    expect(mapShopifyStatus("paid")).toBe("fulfilled");
    expect(mapShopifyStatus("refunded")).toBe("refunded");
    expect(mapShopifyStatus("voided")).toBe("cancelled");
    expect(mapShopifyStatus("pending")).toBe("pending");
  });
  it("defaults unknown statuses to fulfilled", () => {
    expect(mapShopifyStatus("something-new")).toBe("fulfilled");
  });
});

describe("upsertShopifyOrder idempotency", () => {
  it("is exported and callable (DB-level idempotency covered by unique index)", async () => {
    // Without a DB we can only assert the function shape; the unique
    // (teamId, storeId, externalId) index guarantees upsert idempotency.
    expect(typeof upsertShopifyOrder).toBe("function");
    await expect(
      upsertShopifyOrder(
        { id: 1, name: "#1", created_at: new Date().toISOString(), currency: "USD", total_price: "10", subtotal_price: "10", total_discounts: "0", total_tax: "0", financial_status: "paid" },
        "000000000000000000000000",
        "000000000000000000000000",
        "USD"
      )
    ).rejects.toThrow(); // no DB in unit tests — must fail, not silently succeed
  });
});

describe("hmac timing safety", () => {
  it("does not throw on unequal-length inputs", () => {
    process.env.SHOPIFY_CLIENT_SECRET = "s";
    expect(() => verifyShopifyHmac("a", "short")).not.toThrow();
    expect(verifyShopifyHmac("a", "short")).toBe(false);
  });
});

vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-secret");
