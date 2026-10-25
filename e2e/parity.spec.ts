/**
 * Parity e2e — unauthenticated surface of every new page and API.
 * Dashboard pages must redirect to login (never 404 or 500), and
 * APIs must answer 401 JSON (never 500) without a session. The full
 * authenticated new-user flow (register → connect → import → COGS →
 * every page) requires a live dev store and is documented in
 * docs/MANUAL_STEPS.md; it is not faked here.
 */
import { test, expect } from "@playwright/test";

const PAGES = [
  "/dashboard/mission-control",
  "/dashboard/revenue-by-date",
  "/dashboard/countries",
  "/dashboard/conversion",
  "/dashboard/report-guide",
  "/dashboard/cogs-hub",
  "/dashboard/monthly-expenses",
  "/dashboard/other-fees",
  "/dashboard/ad-platforms",
  "/dashboard/gateways",
  "/dashboard/currency",
  "/dashboard/tax",
  "/dashboard/stores",
  "/dashboard/general",
  "/dashboard/leaks",
  "/dashboard/copilot",
  "/dashboard/saved-views",
  "/dashboard/scheduled-reports",
  "/dashboard/custom-dashboard",
];

for (const path of PAGES) {
  test(`unauthenticated ${path} redirects to login, not a 404/500`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res).not.toBeNull();
    expect([200, 307, 308]).toContain(res!.status());
    await expect(page).toHaveURL(/\/auth\/login/);
  });
}

const APIS = [
  "/api/analytics/revenue-by-date",
  "/api/analytics/countries",
  "/api/analytics/conversion",
  "/api/analytics/mission-control",
  "/api/analytics/leaks",
  "/api/analytics/ad-health",
  "/api/monthly-expenses",
  "/api/other-fees",
  "/api/gateways",
  "/api/saved-views",
  "/api/scheduled-reports",
  "/api/settings/workspace",
];

for (const path of APIS) {
  test(`unauthenticated GET ${path} answers 401 JSON`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
}

test("legacy dashboard aliases redirect", async ({ page }) => {
  await page.goto("/dashboard/shipments");
  await expect(page).toHaveURL(/\/auth\/login|\/dashboard\/couriers/);
});
