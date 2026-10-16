import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { runCronJob } from "@/lib/cron-runner";
import { CRON_JOBS } from "@/lib/jobs";
import { fail } from "@/lib/validation";

/** 6-hour bucket for idempotency, e.g. "2026-10-16T18" (00/06/12/18). */
function sixHourBucket(d: Date): string {
  const h = Math.floor(d.getUTCHours() / 6) * 6;
  return `${d.toISOString().slice(0, 10)}T${String(h).padStart(2, "0")}`;
}

/**
 * GET /api/cron/refresh-ad-spend
 * Vercel Cron (every 6 hours). Guarded by CRON_SECRET bearer auth.
 */
export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const rl = await withRateLimit(req, "strict", "cron-ad-spend");
  if (rl) return rl;

  const job = CRON_JOBS["refresh-ad-spend"];
  if (!job) return fail("Unknown job", 500, "UNKNOWN_JOB");

  try {
    const result = await runCronJob("refresh-ad-spend", job.run, {
      idempotencyKey: `refresh-ad-spend:${sixHourBucket(new Date())}`,
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
