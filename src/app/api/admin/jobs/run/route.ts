import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail } from "@/lib/validation";
import { runCronJob } from "@/lib/cron-runner";
import { CRON_JOBS } from "@/lib/jobs";
import { logger, toLogError } from "@/lib/logger";

const BodySchema = z
  .object({
    jobName: z.string().trim().min(1).max(64),
  })
  .strict();

/**
 * POST /api/admin/jobs/run
 * Manually trigger a job from the admin jobs UI. Owner/admin only.
 * The job runs via after() — the response returns immediately with 202.
 * Idempotency key is unique per manual trigger (timestamped).
 */
export async function POST(req: NextRequest) {
  const authed = await requireAuth(req, {
    rateLimitKey: "admin-jobs-run",
    permission: "manage:team",
  });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, BodySchema);
  if ("response" in parsed) return parsed.response;

  const job = CRON_JOBS[parsed.data.jobName];
  if (!job) return fail("Unknown job", 400, "UNKNOWN_JOB");

  const idempotencyKey =
    `${parsed.data.jobName}:manual:${new Date().toISOString()}:${session.userId}`;
  const userId = session.userId;

  after(async () => {
    try {
      await runCronJob(parsed.data.jobName, job.run, {
        idempotencyKey,
        triggeredBy: "manual",
        triggeredByUserId: userId,
      });
    } catch (err) {
      logger.error("manual job failed", toLogError(err), {
        jobName: parsed.data.jobName,
        userId,
      });
    }
  });

  return NextResponse.json(
    { ok: true, jobName: parsed.data.jobName, status: "started" },
    { status: 202 }
  );
}
