"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to monitoring service in production
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center px-4 py-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-4">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-2">Something went wrong</h2>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-6 max-w-sm">
            {this.state.error?.message ?? "An unexpected error occurred. Our team has been notified."}
          </p>
          <Button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Next.js App Router error.tsx for dashboard route group
export function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center px-4">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-5">
        <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Page failed to load</h2>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-6 max-w-sm">
        {error.message ?? "An unexpected error occurred."}
        {error.digest && <span className="block mt-1 font-mono text-xs opacity-60">Error ID: {error.digest}</span>}
      </p>
      <Button onClick={reset} className="gap-2">
        <RefreshCw className="h-4 w-4" /> Try Again
      </Button>
    </div>
  );
}
