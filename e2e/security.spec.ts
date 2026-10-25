/**
 * Security e2e — unauthenticated surface of the new security routes.
 * Dashboard security page redirects to login; APIs answer 401 JSON;
 * security.txt serves the disclosure contact; 2FA verify page renders
 * (it is the login-step page, so it must NOT redirect to login).
 */
import { test, expect } from "@playwright/test";

test("unauthenticated /dashboard/security redirects to login", async ({ page }) => {
  const res = await page.goto("/dashboard/security");
  expect(res).not.toBeNull();
  expect([200, 307, 308]).toContain(res!.status());
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("unauthenticated 2FA verify page renders", async ({ page }) => {
  await page.goto("/auth/2fa-verify");
  await expect(page.getByText("Two-factor verification")).toBeVisible();
});

for (const path of [
  "/api/auth/2fa/setup",
  "/api/auth/sessions",
  "/api/agency/clients",
  "/api/analytics/f1",
  "/api/comments",
  "/api/privacy/export",
]) {
  test(`unauthenticated GET ${path} is rejected, not 200/500`, async ({ request }) => {
    const res = await request.get(path);
    expect([401, 403, 405]).toContain(res.status());
  });
}

// /api/admin/* is middleware-protected: unauthenticated requests are
// redirected to login (302), not served the API. Playwright follows
// redirects by default, so assert the redirect itself.
test("unauthenticated GET /api/admin/security redirects to login", async ({ request }) => {
  const res = await request.get("/api/admin/security", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"] ?? "").toContain("/auth/login");
});

test("security.txt serves disclosure contact", async ({ request }) => {
  const res = await request.get("/.well-known/security.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain("Contact:");
});
