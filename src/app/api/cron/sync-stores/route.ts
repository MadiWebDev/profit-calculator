import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { runCronJob } from "@/lib/cron-runner";
import { CRON_JOBS } from "@/lib/jobs";
import { fail } from "@/lib/validation";

/** Hour bucket for idempotency, e.g. "2026-10-16T23". */
function hourBucket(d: Date): string {
  return d.toISOString().slice(0, 13);
}

/**
 * GET /api/cron/sync-stores
 * Vercel Cron (hourly). Guarded by CRON_SECRET bearer auth.
 * Idempotent per hour; overlapping runs are skipped.
 */
export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const rl = await withRateLimit(req, "strict", "cron-sync-stores");
  if (rl) return rl;

  const job = CRON_JOBS["sync-stores"];
  if (!job) return fail("Unknown job", 500, "UNKNOWN_JOB");

  try {
    const result = await runCronJob("sync-stores", job.run, {
      idempotencyKey: `sync-stores:${hourBucket(new Date())}`,
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
