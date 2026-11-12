/**
 * Env validation tests — CRON_SECRET optionality.
 *
 * Regression test for the Vercel preview build failure (2026-11-12):
 * `next build` prerenders /admin, which calls connectDB() -> validateEnv(),
 * and the global schema required CRON_SECRET — so a preview deployment
 * without it (Preview env scope) died at "Generating static pages".
 * CRON_SECRET is now optional in the global schema because cron routes
 * enforce it per-request via verifyCronAuth (500s when unset, 401 on a
 * wrong token — see cron-auth.test.ts), so a missing secret must not fail
 * the build or server boot. The weak-placeholder guard is preserved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const REQUIRED_VARS: Record<string, string> = {
  NODE_ENV: "production",
  AUTH_SECRET: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  MONGODB_URI: "mongodb://127.0.0.1:27017/profit-test",
  PADDLE_API_KEY: "test-paddle-api-key",
  PADDLE_WEBHOOK_SECRET: "test-paddle-webhook-secret",
  NEXT_PUBLIC_SITE_URL: "https://getprofitcalc.com",
};

const TOUCHED = [...Object.keys(REQUIRED_VARS), "CRON_SECRET"];

describe("CRON_SECRET is optional in the global env schema", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of TOUCHED) saved[key] = process.env[key];
    for (const [key, value] of Object.entries(REQUIRED_VARS)) {
      process.env[key] = value;
    }
    delete process.env.CRON_SECRET;
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of TOUCHED) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key] as string;
    }
    vi.resetModules();
  });

  async function loadEnv() {
    return (await import("@/lib/env")) as typeof import("@/lib/env");
  }

  it("validateEnv() does not throw in production when CRON_SECRET is missing", async () => {
    const { validateEnv, isEnvValid } = await loadEnv();
    expect(isEnvValid()).toBe(true);
    expect(() => validateEnv()).not.toThrow();
  });

  it("validateEnv() does not throw with a valid CRON_SECRET set", async () => {
    // NOTE: must not contain a WEAK substring ("secret", "change-me", ...).
    process.env.CRON_SECRET = "test-cron-token-1234567890";
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("validateEnv() still throws on a known weak CRON_SECRET placeholder", async () => {
    // >= 16 chars so the Zod min() passes and the placeholder guard is reached.
    process.env.CRON_SECRET = "change-me-1234567890";
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).toThrow(/CRON_SECRET is a known placeholder/);
  });
});
