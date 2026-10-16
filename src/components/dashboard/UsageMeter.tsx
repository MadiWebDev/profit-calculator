"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Meter {
  key: string;
  label: string;
  used: number;
  limit: number;
  ratio: number;
  warn: boolean;
  exhausted: boolean;
  unlimited: boolean;
}

interface UsageResponse {
  plan: string;
  planSource: string;
  meters: Meter[];
  upgradeUrl: string;
}

/**
 * Sidebar usage meter — warns at 80%, shows an upgrade CTA at 100%.
 * Clicking the CTA opens the pricing page (PricingModal lives on /pricing).
 */
export function UsageMeter() {
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: UsageResponse | null) => {
        if (!cancelled && j) setData(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  // Only show meters that are close to (or at) their limit, plus orders always
  const visible = data.meters.filter(
    (m) => m.key === "orders" || m.warn || m.exhausted
  );
  if (visible.length === 0) return null;

  const anyExhausted = visible.some((m) => m.exhausted);

  return (
    <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--color-foreground)] capitalize">
          {data.plan} plan
        </p>
        {anyExhausted && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            Limit reached
          </span>
        )}
      </div>

      {visible.map((m) => (
        <div key={m.key}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[var(--color-muted-foreground)]">{m.label}</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                m.exhausted
                  ? "text-red-600 dark:text-red-400"
                  : m.warn
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-[var(--color-muted-foreground)]"
              )}
            >
              {m.unlimited ? `${m.used} / ∞` : `${m.used} / ${m.limit}`}
            </span>
          </div>
          {!m.unlimited && (
            <div
              className="h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(m.ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${m.label} usage`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  m.exhausted
                    ? "bg-red-500"
                    : m.warn
                      ? "bg-amber-500"
                      : "bg-[var(--color-primary)]"
                )}
                style={{ width: `${Math.min(100, Math.round(m.ratio * 100))}%` }}
              />
            </div>
          )}
        </div>
      ))}

      {(anyExhausted || visible.some((m) => m.warn)) && (
        <Link
          href={data.upgradeUrl}
          className={cn(
            "flex items-center justify-center gap-1.5 w-full rounded-lg px-3 py-1.5",
            "text-xs font-semibold text-white",
            "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600",
            "transition-colors"
          )}
        >
          <Crown className="h-3.5 w-3.5" />
          {anyExhausted ? "Upgrade to continue" : "Upgrade for more"}
        </Link>
      )}
    </div>
  );
}
