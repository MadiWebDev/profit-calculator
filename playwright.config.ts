import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke tests — run against a local dev server:
 *   npm run dev            # in one terminal
 *   npx playwright test    # in another
 * CI installs chromium automatically (see .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Fail fast if the app isn't reachable — don't hang the suite
  webServer: undefined,
});
