import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

/**
 * Skeleton variants — each reserves the same space as the final content
 * (fixed heights/widths matching the real layout) so the page does not
 * jump when the real content arrives. Blocks use `bg-muted`
 * (`var(--color-muted)`); `animate-pulse` is disabled under
 * `prefers-reduced-motion` by the rule in globals.css.
 *
 * Full-section skeletons carry `role="status"` + an sr-only "Loading..."
 * so screen readers announce them. The primitive `Skeleton` block stays
 * plain (no role) — it is a layout block, not a status.
 *
 * NOTE: `src/components/dashboard/DashboardSkeleton.tsx` keeps its own
 * KpiSkeleton / ChartSkeleton / TableSkeleton, which already match the
 * dashboard layout — reuse those for dashboard pages. The generic
 * variants here are for every other page. `CardSkeleton` exists in both
 * files (identical layout); the dashboard one is left untouched so its
 * existing consumers are unaffected.
 */

function SkeletonStatus({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading...</span>
      {children}
    </div>
  );
}

/** Generic content card: title + two text lines. Matches a p-5 card. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-3',
        className
      )}
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

/** Vertical list: avatar dot + two lines per row. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonStatus>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

/** Form: label + input per field, then a submit-button block. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonStatus>
      <div className="space-y-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-32" />
      </div>
    </SkeletonStatus>
  );
}

/** Profile header: large avatar, name, handle, then a stats row. */
export function ProfileSkeleton() {
  return (
    <SkeletonStatus>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonStatus>
  );
}

/** Row of stat cards (value + label each). Generic counterpart of the
 * dashboard KpiSkeleton; use the dashboard one on dashboard pages. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <SkeletonStatus>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

export { Skeleton };
