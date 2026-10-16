import { KpiSkeleton, ChartSkeleton, TableSkeleton } from "@/components/dashboard/DashboardSkeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-lg bg-[var(--color-muted)]" />
          <div className="h-4 w-44 rounded-lg bg-[var(--color-muted)]" />
        </div>
      </div>
      <KpiSkeleton />
      <ChartSkeleton height={260} />
      <TableSkeleton rows={6} />
    </div>
  );
}
