import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { CronRunModel } from "@/models/CronRun";
import { serializeCronRun } from "@/lib/cron-runner";
import { CRON_JOBS } from "@/lib/jobs";
import { JobsClient } from "./JobsClient";

/**
 * Settings → Jobs (owner/admin).
 * Lists scheduled jobs, their cadence, last run status, and recent history.
 * Manual triggers run via POST /api/admin/jobs/run.
 */
export default async function JobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as { teamId?: string; role?: string };
  if (!user.teamId) redirect("/onboarding");
  if (user.role !== "owner" && user.role !== "admin") redirect("/dashboard/settings");

  await connectDB();
  const latest = await CronRunModel.aggregate([
    { $sort: { startedAt: -1 } },
    { $group: { _id: "$jobName", run: { $first: "$$ROOT" } } },
  ]);
  const latestByJob: Record<string, ReturnType<typeof serializeCronRun>> = {};
  for (const { run } of latest as Array<{ run: Parameters<typeof serializeCronRun>[0] }>) {
    latestByJob[run.jobName] = serializeCronRun(run);
  }

  const recent = await CronRunModel.find({})
    .sort({ startedAt: -1 })
    .limit(25)
    .lean();

  const jobs = Object.entries(CRON_JOBS).map(([name, j]) => ({
    name,
    description: j.description,
    schedule: j.schedule,
    lastRun: latestByJob[name] ?? null,
  }));

  return (
    <JobsClient
      jobs={jobs}
      recentRuns={recent.map(serializeCronRun)}
    />
  );
}
