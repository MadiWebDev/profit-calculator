import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CalculatorConfig } from "@/types/calculator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const categoryColors: Record<string, string> = {
  ecommerce:   "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  advertising: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  freelance:   "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  general:     "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

interface CalculatorCardProps {
  config: CalculatorConfig;
  featured?: boolean;
}

export function CalculatorCard({ config, featured = false }: CalculatorCardProps) {
  return (
    <Link
      href={`/calculators/${config.slug}`}
      className={cn(
        "group block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 hover:border-[var(--color-primary)] hover:shadow-md transition-all duration-200",
        featured && "md:col-span-2 lg:col-span-1"
      )}
      aria-label={`Open ${config.title}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl" role="img" aria-label={config.shortTitle}>
          {config.icon}
        </span>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            categoryColors[config.category]
          )}
        >
          {config.category}
        </span>
      </div>
      <h3 className="font-semibold text-[var(--color-foreground)] mb-1 group-hover:text-[var(--color-primary)] transition-colors">
        {config.shortTitle}
      </h3>
      <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed line-clamp-2 mb-3">
        {config.description}
      </p>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)]">
        Open Calculator <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
      </span>
    </Link>
  );
}
