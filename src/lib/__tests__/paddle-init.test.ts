/**
 * paddle-init.test.ts — shared Paddle.js singleton.
 *
 * Vitest runs in a node environment (no window), so these tests cover the
 * environment guards and the pure timeout helper. The browser behaviour
 * (shared init promise, await-on-click, checkout.completed dispatch) is
 * covered by the Playwright smoke spec
 * ~/workspace/currency-smoke/paddle-fast-init.spec.ts.
 */

import { describe, it, expect } from "vitest";
import {
  PADDLE_INIT_TIMEOUT_MS,
  awaitPaddle,
  warmPaddle,
  withTimeout,
} from "@/lib/paddle-init";

describe("withTimeout", () => {
  it("resolves the value when the promise settles before the timeout", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("resolves null when the promise does not settle in time", async () => {
    const never = new Promise<string>(() => undefined);
    await expect(withTimeout(never, 10)).resolves.toBeNull();
  });

  it("propagates a rejection instead of swallowing it", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000)
    ).rejects.toThrow("boom");
  });
});

describe("PADDLE_INIT_TIMEOUT_MS", () => {
  it("is 10 seconds", () => {
    expect(PADDLE_INIT_TIMEOUT_MS).toBe(10_000);
  });
});

describe("warmPaddle / awaitPaddle (node — no window)", () => {
  it("warmPaddle resolves null without a window", async () => {
    await expect(warmPaddle()).resolves.toBeNull();
  });

  it("warmPaddle with a customer id also resolves null without a window", async () => {
    await expect(warmPaddle("cus_123")).resolves.toBeNull();
  });

  it("awaitPaddle resolves null fast (no 10s wait) without a window", async () => {
    const start = Date.now();
    await expect(awaitPaddle()).resolves.toBeNull();
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
