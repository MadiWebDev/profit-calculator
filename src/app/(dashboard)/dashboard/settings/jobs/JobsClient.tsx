"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, Play, Loader2, CheckCircle2, XCircle,
  AlertTriangle, MinusCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface JobInfo {
  name: string;
  description: string;
  schedule: string;
  lastRun: RunInfo | null;
}

interface RunInfo {
  id: string;
  jobName: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  stats: Record<string, number>;
  error?: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    succeeded: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    partial:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    failed:    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    running:   "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  };
  const icons: Record<string, typeof CheckCircle2> = {
    succeeded: CheckCircle2,
    partial: AlertTriangle,
    failed: XCircle,
    running: Loader2,
  };
  const Icon = icons[status] ?? MinusCircle;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
      styles[status] ?? "bg-slate-100 text-slate-600"
    )}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {status}
    </span>
  );
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function JobsClient({ jobs, recentRuns }: {
  jobs: JobInfo[];
  recentRuns: RunInfo[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function triggerJob(name: string) {
    if (running) return;
    setRunning(name);
    setError(null);
    try {
      const res = await fetch("/api/admin/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobName: name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Failed to start job");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error starting job");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Scheduled Jobs</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
          Background jobs keep stores synced, ad spend fresh, and goal alerts firing.
          Runs are idempotent — triggering twice is safe.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-600">
          <XCircle className="h-4 w-4 flex-shrink-0" />{error}
          <button className="ml-auto" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Job cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {jobs.map((job) => (
          <div
            key={job.name}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-[var(--color-foreground)]">
                <Clock className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                {job.name}
              </span>
              {job.lastRun && <StatusBadge status={job.lastRun.status} />}
            </div>
            <p className="text-sm text-[var(--color-muted-foreground)] flex-1">
              {job.description}
            </p>
            <div className="text-xs text-[var(--color-muted-foreground)] space-y-1">
              <p>Schedule: <span className="font-medium text-[var(--color-foreground)]">{job.schedule}</span></p>
              <p>Last run: {formatDate(job.lastRun?.startedAt)} ({job.lastRun ? formatDuration(job.lastRun.durationMs) : "never"})</p>
              {job.lastRun?.error && (
                <p className="text-red-500 truncate" title={job.lastRun.error}>{job.lastRun.error}</p>
              )}
            </div>
            <button
              onClick={() => triggerJob(job.name)}
              disabled={running !== null}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {running === job.name
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
                : <><Play className="h-4 w-4" /> Run now</>
              }
            </button>
          </div>
        ))}
      </div>

      {/* Recent runs */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-semibold text-[var(--color-foreground)]">Recent runs</h2>
          <button
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Triggered by</th>
                <th className="px-5 py-3 font-medium">Started</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Stats</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-[var(--color-muted-foreground)]">
                    No runs yet. Jobs execute on their schedule, or trigger one manually above.
                  </td>
                </tr>
              )}
              {recentRuns.map((run) => (
                <tr key={run.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-5 py-3 font-medium text-[var(--color-foreground)]">{run.jobName}</td>
                  <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-5 py-3 text-[var(--color-muted-foreground)]">{run.triggeredBy}</td>
                  <td className="px-5 py-3 text-[var(--color-muted-foreground)] tabular-nums">{formatDate(run.startedAt)}</td>
                  <td className="px-5 py-3 text-[var(--color-muted-foreground)] tabular-nums">{formatDuration(run.durationMs)}</td>
                  <td className="px-5 py-3 text-[var(--color-muted-foreground)] tabular-nums">
                    {Object.entries(run.stats ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
