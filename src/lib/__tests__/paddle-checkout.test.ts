import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkoutSuccessUrl,
  initWithTimeoutAndRetry,
  isUsableCheckoutUrl,
  mapPricingIntervalToBillingInterval,
  requestHostedCheckout,
  resolveCheckoutUrl,
  withTimeout,
} from "@/lib/paddle-checkout";

const SUCCESS_URL = "https://getprofitcalc.com/dashboard/settings?upgraded=1";
const PADDLE_URL = "https://checkout.paddle.com/checkout?token=abc123";

describe("mapPricingIntervalToBillingInterval", () => {
  it("maps all four client intervals to the route's interval names", () => {
    expect(mapPricingIntervalToBillingInterval("month")).toBe("monthly");
    expect(mapPricingIntervalToBillingInterval("quarter")).toBe("quarterly");
    expect(mapPricingIntervalToBillingInterval("semiannual")).toBe("semiannual");
    expect(mapPricingIntervalToBillingInterval("year")).toBe("annual");
  });
});

describe("isUsableCheckoutUrl", () => {
  it("accepts a real Paddle checkout URL", () => {
    expect(isUsableCheckoutUrl(PADDLE_URL, SUCCESS_URL)).toBe(true);
  });

  it("rejects the post-payment success URL (exact and trailing-slash)", () => {
    expect(isUsableCheckoutUrl(SUCCESS_URL, SUCCESS_URL)).toBe(false);
    expect(isUsableCheckoutUrl(`${SUCCESS_URL}/`, SUCCESS_URL)).toBe(false);
  });

  it("rejects non-strings, empty strings, relative URLs, and non-http(s) schemes", () => {
    expect(isUsableCheckoutUrl(undefined, SUCCESS_URL)).toBe(false);
    expect(isUsableCheckoutUrl(null, SUCCESS_URL)).toBe(false);
    expect(isUsableCheckoutUrl(42, SUCCESS_URL)).toBe(false);
    expect(isUsableCheckoutUrl("   ", SUCCESS_URL)).toBe(false);
    expect(isUsableCheckoutUrl("/dashboard/settings?upgraded=1", SUCCESS_URL)).toBe(false);
    expect(isUsableCheckoutUrl("javascript:alert(1)", SUCCESS_URL)).toBe(false);
    expect(isUsableCheckoutUrl("ftp://example.com/x", SUCCESS_URL)).toBe(false);
  });
});

describe("resolveCheckoutUrl", () => {
  it("extracts a usable URL from the checkout response body", () => {
    expect(resolveCheckoutUrl({ url: PADDLE_URL }, SUCCESS_URL)).toBe(PADDLE_URL);
  });

  it("returns null when the body has no usable URL", () => {
    expect(resolveCheckoutUrl({}, SUCCESS_URL)).toBe(null);
    expect(resolveCheckoutUrl({ url: SUCCESS_URL }, SUCCESS_URL)).toBe(null);
    expect(resolveCheckoutUrl({ url: null }, SUCCESS_URL)).toBe(null);
    expect(resolveCheckoutUrl(null, SUCCESS_URL)).toBe(null);
    expect(resolveCheckoutUrl("nope", SUCCESS_URL)).toBe(null);
  });
});

describe("checkoutSuccessUrl", () => {
  it("is the settings upgrade URL, never a checkout URL", () => {
    const url = checkoutSuccessUrl();
    expect(url).toContain("/dashboard/settings?upgraded=1");
    expect(isUsableCheckoutUrl(url, url)).toBe(false);
  });
});

describe("withTimeout", () => {
  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100, "test")).resolves.toBe("ok");
  });

  it("rejects with a timeout error when the promise hangs", async () => {
    const hanging = new Promise<string>(() => {});
    await expect(withTimeout(hanging, 10, "Paddle initialisation")).rejects.toThrow(
      "Paddle initialisation timed out after 10ms"
    );
  });

  it("propagates the promise's own rejection", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 100, "test")
    ).rejects.toThrow("boom");
  });
});

describe("initWithTimeoutAndRetry", () => {
  it("returns the first attempt's value on success", async () => {
    let attempts = 0;
    const value = await initWithTimeoutAndRetry(async () => {
      attempts += 1;
      return "paddle";
    });
    expect(value).toBe("paddle");
    expect(attempts).toBe(1);
  });

  it("retries once after a failure and returns the retry's value", async () => {
    let attempts = 0;
    const value = await initWithTimeoutAndRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("CDN blocked");
      return "paddle";
    });
    expect(value).toBe("paddle");
    expect(attempts).toBe(2);
  });

  it("retries once after a timeout, then succeeds", async () => {
    let attempts = 0;
    const value = await initWithTimeoutAndRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) return new Promise<string>(() => {}); // hangs
        return "paddle";
      },
      { timeoutMs: 10 }
    );
    expect(value).toBe("paddle");
    expect(attempts).toBe(2);
  });

  it("throws the last error after every attempt fails", async () => {
    let attempts = 0;
    await expect(
      initWithTimeoutAndRetry(async () => {
        attempts += 1;
        throw new Error(`fail ${attempts}`);
      })
    ).rejects.toThrow("fail 2");
    expect(attempts).toBe(2);
  });
});

describe("requestHostedCheckout", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetch(body: unknown, status = 200) {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(body), { status })
    ) as unknown as typeof fetch;
  }

  it("returns the checkout URL on a 200 with a usable URL", async () => {
    mockFetch({ url: PADDLE_URL });
    await expect(requestHostedCheckout("growth", "monthly")).resolves.toEqual({
      url: PADDLE_URL,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan: "growth", interval: "monthly" }),
      })
    );
  });

  it("throws when the server returns no usable URL (never redirects to Settings)", async () => {
    mockFetch({ url: checkoutSuccessUrl() });
    await expect(requestHostedCheckout("starter", "annual")).rejects.toThrow(
      "Checkout could not be opened right now"
    );
    mockFetch({});
    await expect(requestHostedCheckout("starter", "annual")).rejects.toThrow(
      "Checkout could not be opened right now"
    );
  });

  it("throws a sign-in message on 401", async () => {
    mockFetch({ error: "Unauthorized" }, 401);
    await expect(requestHostedCheckout("pro", "quarterly")).rejects.toThrow(
      "sign in again"
    );
  });

  it("surfaces the server's message on 502/500", async () => {
    mockFetch({ error: "Paddle did not return a checkout URL. Please try again." }, 502);
    await expect(requestHostedCheckout("starter", "monthly")).rejects.toThrow(
      "Paddle did not return a checkout URL"
    );
  });

  it("throws a connection message when fetch itself fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(requestHostedCheckout("starter", "monthly")).rejects.toThrow(
      "Could not reach the checkout server"
    );
  });
});
