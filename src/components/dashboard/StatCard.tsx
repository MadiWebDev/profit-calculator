import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: number;   // % change vs prior period
  changeLabel?: string;
  icon?: LucideIcon;
  highlight?: boolean;
  className?: string;
}

export function StatCard({ label, value, change, changeLabel, icon: Icon, highlight, className }: StatCardProps) {
  const isPos = (change ?? 0) > 0;
  const isNeg = (change ?? 0) < 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        highlight && "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-[var(--color-muted-foreground)] font-medium">{label}</p>
        {Icon && (
          <span className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            highlight ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          )}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={cn(
        "text-2xl font-bold mb-1",
        highlight ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]"
      )}>
        {value}
      </p>
      {change !== undefined && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium",
          isPos ? "text-green-600 dark:text-green-400" : isNeg ? "text-red-500" : "text-[var(--color-muted-foreground)]"
        )}>
          {isPos ? <TrendingUp className="h-3.5 w-3.5" /> : isNeg ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
          <span>{isPos ? "+" : ""}{change?.toFixed(1)}%</span>
          {changeLabel && <span className="text-[var(--color-muted-foreground)] font-normal">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
