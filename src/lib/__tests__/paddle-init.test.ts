/**
 * paddle-init.test.ts — shared Paddle.js singleton.
 *
 * Vitest runs in a node environment (no window), so these tests cover the
 * environment guards, the pure timeout helper, and the readiness-status
 * transitions that don't need the SDK (initial "loading", env-missing →
 * "failed"). The browser behaviour (shared init promise, await-on-click,
 * checkout.completed dispatch, button loading states, toasts) is covered
 * by the Playwright smoke specs
 * ~/workspace/currency-smoke/paddle-fast-init.spec.ts and
 * ~/workspace/currency-smoke/paddle-toast-ready.spec.ts.
 */

import { describe, it, expect } from "vitest";
import {
  PADDLE_INIT_TIMEOUT_MS,
  awaitPaddle,
  getPaddleStatus,
  subscribePaddleStatus,
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

describe("getPaddleStatus / subscribePaddleStatus", () => {
  it("starts as 'loading' before any attempt settles", () => {
    expect(getPaddleStatus()).toBe("loading");
  });

  it("subscribePaddleStatus returns an unsubscribe function", () => {
    const unsub = subscribePaddleStatus(() => undefined);
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });

  it("notifies listeners with 'failed' when the env vars are missing", async () => {
    // No window → warmPaddle returns early without touching the status,
    // so fake one: the env-missing branch runs before any SDK import,
    // which makes this deterministic in node (no network, no DOM).
    const g = globalThis as Record<string, unknown>;
    const prevWindow = g.window;
    const prevToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const prevEnv = process.env.NEXT_PUBLIC_PADDLE_ENV;
    delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    delete process.env.NEXT_PUBLIC_PADDLE_ENV;
    g.window = {};
    try {
      const seen: string[] = [];
      const unsub = subscribePaddleStatus((s) => seen.push(s));
      await expect(warmPaddle()).resolves.toBeNull();
      expect(getPaddleStatus()).toBe("failed");
      expect(seen).toEqual(["failed"]);
      unsub();
    } finally {
      if (prevWindow === undefined) delete g.window;
      else g.window = prevWindow;
      if (prevToken === undefined) delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
      else process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = prevToken;
      if (prevEnv === undefined) delete process.env.NEXT_PUBLIC_PADDLE_ENV;
      else process.env.NEXT_PUBLIC_PADDLE_ENV = prevEnv;
    }
  });
});
