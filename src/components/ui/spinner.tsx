import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const spinnerSizes = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
} as const;

export type SpinnerSize = keyof typeof spinnerSizes;

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  /**
   * Accessible label for screen readers. Defaults to "Loading...".
   * Pass `label=""` to render the spinner as purely decorative
   * (no `role="status"`) when the parent already announces loading.
   */
  label?: string;
}

/**
 * Theme-aware loading spinner (currentColor, so it inherits the colour of
 * its context). `motion-reduce:animate-none` + the global
 * `prefers-reduced-motion` rule in globals.css keep it static for users
 * who asked for reduced motion.
 */
export function Spinner({ size = "md", className, label = "Loading..." }: SpinnerProps) {
  if (label === "") {
    return (
      <Loader2
        className={cn("animate-spin motion-reduce:animate-none", spinnerSizes[size], className)}
        aria-hidden="true"
      />
    );
  }
  return (
    <span role="status" className={cn("inline-flex items-center justify-center", className)}>
      <Loader2
        className={cn("animate-spin motion-reduce:animate-none", spinnerSizes[size])}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
