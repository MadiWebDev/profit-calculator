"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface PageLoaderProps {
  /** Optional message shown under the spinner, e.g. "Redirecting to checkout…". */
  message?: string;
  className?: string;
}

/**
 * Full-screen overlay for HEAVY operations only — checkout redirects and
 * large imports. Do NOT use it for ordinary data fetches (use skeletons
 * or `<Button loading>` instead); blocking the whole screen for a routine
 * load is the failure mode this system exists to prevent.
 *
 * Phase 0 defines the component only; Phase 1 wires it into the heavy
 * call sites. `role="status"` + the Spinner's sr-only text announce it
 * to screen readers.
 */
export function PageLoader({ message, className }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-label={message ?? "Loading"}
      className={cn(
        "fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-[var(--color-background)]/80 backdrop-blur-sm",
        className,
      )}
    >
      <Spinner size="lg" label="" />
      <span className="sr-only">Loading...</span>
      {message && (
        <p className="max-w-sm text-center text-sm text-[var(--color-muted-foreground)]">
          {message}
        </p>
      )}
    </div>
  );
}
