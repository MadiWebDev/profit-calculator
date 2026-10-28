import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { runCronJob } from "@/lib/cron-runner";
import { CRON_JOBS } from "@/lib/jobs";
import { fail } from "@/lib/validation";

/**
 * GET /api/cron/apikey-reset
 * Vercel Cron (monthly, 1st). Guarded by CRON_SECRET bearer token.
 * Resets ApiKey.recentUseCount counters so the rolling abuse-detection
 * window stays meaningful instead of growing forever.
 */
export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const rl = await withRateLimit(req, "strict", "cron-apikey-reset");
  if (rl) return rl;

  const job = CRON_JOBS["apikey-reset"];
  if (!job) return fail("Unknown job", 500, "UNKNOWN_JOB");

  try {
    const result = await runCronJob("apikey-reset", job.run, {
      idempotencyKey: `apikey-reset:${new Date().toISOString().slice(0, 7)}`,
      triggeredBy: "cron",
    });
    if (result.skipped) {
      return NextResponse.json({ skipped: true, reason: result.reason });
    }
    return NextResponse.json({ ok: true, runId: result.runId });
  } catch {
    return fail("Job failed", 500, "JOB_FAILED");
  }
}
