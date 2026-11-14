/**
 * service-worker.test.ts — guards on public/sw.js.
 *
 * The worker is plain browser JS (no module to import in vitest), so these
 * tests read the file as text and assert the properties that keep Paddle
 * working. Regression: 2026-11-15, the v1 worker intercepted EVERY `.js`
 * request — including the cross-origin Paddle script — and its cache-first
 * handling failed the subresource load with net::ERR_FAILED, so Paddle.js
 * never loaded and every Subscribe click failed. Unregistering the worker
 * in the browser fixed checkout instantly.
 *
 * The worker is served from public/ verbatim; these assertions are the
 * only automated check that a future edit doesn't reintroduce the
 * interception.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

describe("service worker never intercepts third-party requests", () => {
  it("returns early for cross-origin requests (Paddle, analytics, ads)", () => {
    // The fetch handler must bail out before any respondWith when the
    // request origin differs from the worker's own origin.
    expect(src).toContain("url.origin !== self.location.origin");
  });

  it("does not cache-first a cross-origin .js URL", () => {
    // The static-assets branch must only run for same-origin requests;
    // the origin guard above is what guarantees that.
    const fetchHandler = src.slice(src.indexOf('addEventListener("fetch"'));
    expect(fetchHandler).toContain("url.origin !== self.location.origin");
  });
});

describe("service worker clones responses synchronously", () => {
  it("never clones inside a deferred caches.open().then() (sw.js:72 bug)", () => {
    // v1: `c.put(event.request, res.clone())` ran after the page had
    // started consuming the body — "Response body is already used".
    expect(src).not.toContain("c.put(event.request, res.clone())");
    expect(src).not.toContain(".put(event.request, res.clone())");
  });

  it("clones before returning the response in the static-assets branch", () => {
    expect(src).toContain("const clone = res.clone();");
  });

  it("has a network fallback so the worker never fails a subresource load", () => {
    expect(src).toContain(".catch(() => fetch(event.request))");
  });
});

describe("service worker cache version", () => {
  it("uses a new cache name so v1 caches are purged on activation", () => {
    expect(src).toContain('CACHE_NAME = "getprofitcalc-v2"');
    expect(src).not.toContain('CACHE_NAME = "getprofitcalc-v1"');
  });
});
