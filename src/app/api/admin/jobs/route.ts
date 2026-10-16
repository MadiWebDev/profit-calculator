import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseQuery } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import { CronRunModel } from "@/models/CronRun";
import { serializeCronRun } from "@/lib/cron-runner";

const QuerySchema = z
  .object({
    jobName: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

/**
 * GET /api/admin/jobs?jobName=&limit=
 * Recent cron run history for the admin jobs UI. Owner/admin only.
 */
export async function GET(req: NextRequest) {
  const authed = await requireAuth(req, {
    rateLimitKey: "admin-jobs",
    permission: "manage:team",
  });
  if (authed instanceof NextResponse) return authed;

  const q = parseQuery(req, QuerySchema);
  if ("response" in q) return q.response;

  await connectDB();
  const filter = q.data.jobName ? { jobName: q.data.jobName } : {};
  const runs = await CronRunModel.find(filter)
    .sort({ startedAt: -1 })
    .limit(q.data.limit)
    .lean();

  return NextResponse.json({ runs: runs.map(serializeCronRun) });
}
