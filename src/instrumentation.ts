/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Validates environment variables fail-fast at boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
