import React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div style={style} className={cn("rounded-lg bg-[var(--color-muted)] animate-pulse", className)} />;
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="bg-[var(--color-muted)] border-b border-[var(--color-border)] px-4 py-3 flex gap-4">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-3 flex-1" />)}
      </div>
      <div className="divide-y divide-[var(--color-border)] bg-[var(--color-card)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-4">
            {[1, 2, 3, 4, 5].map((j) => (
              <Skeleton key={j} className={cn("h-3", j === 1 ? "flex-[2]" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <Skeleton className="h-4 w-40 mb-5" />
      <Skeleton style={{ height }} className="w-full rounded-xl" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}
