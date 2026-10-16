/**
 * Smoke tests — public surface only, no auth required.
 * Verifies the app boots, serves key pages, and exposes health probes.
 */
import { test, expect } from "@playwright/test";

test("homepage loads with expected metadata", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/GetProfitCalc/i);
  // Skip link for keyboard users
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeAttached();
});

test("health and readiness probes respond", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(body.status).toBe("ok");

  // Readiness may be 503 without a database — but it must answer JSON
  const ready = await request.get("/api/ready");
  expect([200, 503]).toContain(ready.status());
  const readyBody = await ready.json();
  expect(["ready", "not_ready"]).toContain(readyBody.status);
});

test("OpenAPI spec is served", async ({ request }) => {
  const res = await request.get("/api/docs/openapi");
  expect(res.ok()).toBeTruthy();
  const spec = await res.json();
  expect(spec.openapi).toMatch(/^3\.1/);
  expect(spec.paths["/summary"]).toBeDefined();
});

test("unknown API route returns JSON 404 envelope", async ({ request }) => {
  const res = await request.get("/api/definitely-not-a-route");
  expect(res.status()).toBe(404);
});

test("cookie banner appears and can be accepted", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: "Cookie consent" });
  await expect(banner).toBeVisible({ timeout: 10000 });
  await banner.getByRole("button", { name: "Accept" }).click();
  await expect(banner).toBeHidden();
});
