import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { runCronJob } from "@/lib/cron-runner";
import { CRON_JOBS } from "@/lib/jobs";
import { fail } from "@/lib/validation";

/**
 * GET /api/cron/purge
 * Vercel Cron (daily). Guarded by CRON_SECRET bearer token.
 * Hard-deletes accounts past the 14-day deletion grace period.
 */
export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const rl = await withRateLimit(req, "strict", "cron-purge-deleted-accounts");
  if (rl) return rl;

  const job = CRON_JOBS["purge-deleted-accounts"];
  if (!job) return fail("Unknown job", 500, "UNKNOWN_JOB");

  try {
    const result = await runCronJob("purge-deleted-accounts", job.run, {
      idempotencyKey: `purge-deleted-accounts:${new Date().toISOString().slice(0, 10)}`,
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
