import {
  CardSkeleton,
  FormSkeleton,
  ListSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";
import {
  ChartSkeleton,
  KpiSkeleton,
  TableSkeleton,
} from "@/components/dashboard/DashboardSkeleton";

export type LoadingFallbackVariant = "page" | "form" | "table" | "dashboard";

/**
 * Shared fallback rendered by every `loading.tsx` segment file.
 * Each variant reserves the same space as the real layout (fixed heights /
 * widths) so the page does not jump when content arrives, and carries
 * `role="status"` via the skeleton components.
 *
 *  - `page`      — generic marketing / content page: title, intro lines,
 *                  three cards.
 *  - `form`      — auth / settings / onboarding style: centred card with
 *                  a form skeleton.
 *  - `table`     — list pages (admin, blog index): title + table skeleton.
 *  - `dashboard` — identical layout to the pre-existing
 *                  `(dashboard)/loading.tsx` (title lines, KPI row, chart,
 *                  table), now built from the shared pieces.
 */
export function LoadingFallback({ variant = "page" }: { variant?: LoadingFallbackVariant }) {
  if (variant === "dashboard") {
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

  if (variant === "form") {
    return (
      <div className="mx-auto w-full max-w-md space-y-6 py-10">
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="mx-auto h-4 w-64" />
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <FormSkeleton />
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <TableSkeleton rows={8} />
      </div>
    );
  }

  // "page" — generic content page.
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <ListSkeleton rows={3} />
    </div>
  );
}
