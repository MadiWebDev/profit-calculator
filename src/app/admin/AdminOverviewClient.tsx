"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Live wrapper for the admin overview. The data itself is always fresh
 * from the database on every render (the page is force-dynamic); this
 * wrapper re-fetches it every 30 seconds while the tab is visible, so
 * the numbers stay current without a reload. There is no websocket in
 * this stack — the "Live" badge means auto-refreshing, and the label
 * says so.
 */
const REFRESH_MS = 30_000;

export default function AdminOverviewClient({
  updatedAt,
  children,
}: {
  updatedAt: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(updatedAt);

  useEffect(() => {
    setLastRefresh(updatedAt);
  }, [updatedAt]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const refreshNow = () => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() has no completion callback; clear the spinner
    // after a short beat so the button never looks stuck.
    window.setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Admin Overview</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            Platform revenue, profit and expenses — live from the database.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live · auto-refresh 30s
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Updated {new Date(lastRefresh).toLocaleTimeString()}
          </span>
          <Button variant="outline" size="sm" onClick={refreshNow} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
