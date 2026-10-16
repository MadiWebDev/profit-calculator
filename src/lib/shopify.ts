/**
 * Shopify shared helpers — single source of truth for the Admin API version.
 *
 * API version policy (https://shopify.dev/docs/api/usage/versioning):
 * Shopify ships a new stable version on the first day of each quarter and
 * supports each stable version for ≥12 months. Never use a release candidate
 * in production — RCs can receive breaking changes before they stabilise.
 *
 * Current pinned version: 2026-10 (became stable 2026-10-01).
 * To bump: change SHOPIFY_API_VERSION here only — every caller uses it.
 */
export const SHOPIFY_API_VERSION = "2026-10";

/** Validate a Shopify shop domain: <name>.myshopify.com */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop.trim());
}

/** Parse an RFC 5988 Link header into a map of rel -> URL. Pure function. */
export function parseLinkHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match) out[match[2]] = match[1];
  }
  return out;
}

/**
 * Compute how long to wait before retrying a Shopify request.
 * - 429: honour Retry-After (seconds) when present, else exponential backoff.
 * - X-Shopify-Shop-Api-Call-Limit "39/40" near the cap: pause briefly.
 * Pure function — easy to unit test.
 */
export function computeBackoffMs(
  status: number,
  retryAfterHeader: string | null,
  callLimitHeader: string | null,
  attempt: number
): number {
  if (status === 429 && retryAfterHeader) {
    const secs = Number.parseFloat(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 60_000);
  }
  if (callLimitHeader) {
    const m = callLimitHeader.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const used = Number(m[1]);
      const limit = Number(m[2]);
      // At ≥80% of the bucket, pause to let it drain
      if (limit > 0 && used / limit >= 0.8) return 2_000;
    }
  }
  // Exponential backoff with cap: 1s, 2s, 4s, 8s, 16s, 30s (capped)
  return Math.min(1_000 * 2 ** Math.max(0, attempt), 30_000);
}

/** Sleep helper for backoff loops. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with Shopify-aware retry:
 * - retries 429 and 5xx up to maxAttempts
 * - honours Retry-After and the API call-limit bucket via computeBackoffMs
 * - throws a ShopifyApiError on non-retryable failures
 */
export class ShopifyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ShopifyApiError";
    this.status = status;
  }
}

export async function shopifyFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  maxAttempts = 5
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (e) {
      // Network-level failure — retry with backoff
      lastError = e;
      await sleep(computeBackoffMs(0, null, null, attempt));
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      const wait = computeBackoffMs(
        res.status,
        res.headers.get("retry-after"),
        res.headers.get("x-shopify-shop-api-call-limit"),
        attempt
      );
      await res.arrayBuffer().catch(() => undefined); // drain body
      await sleep(wait);
      lastError = new ShopifyApiError(res.status, `Shopify request failed with ${res.status}`);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ShopifyApiError(res.status, `Shopify API error ${res.status}: ${body.slice(0, 300)}`);
    }

    return res;
  }

  throw lastError instanceof Error
    ? lastError
    : new ShopifyApiError(0, "Shopify request failed after retries");
}

/** Admin REST base URL for a shop. */
export function adminRestBase(shop: string): string {
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`;
}
