"use client";

import { Crown, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRole } from "@/components/dashboard/RoleContext";

export default function TeamPage() {
  const { plan } = useRole();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Workspace</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Your workspace is private — only you have access.
          </p>
        </div>
      </div>

      {/* Ownership card */}
      <Card className="max-w-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-500" />
            Account Owner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            This workspace operates under a single-owner model. Your account has full access to all features
            included in your <span className="font-semibold capitalize">{plan}</span> plan.
          </p>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3 text-sm text-[var(--color-foreground)]">
            <p className="font-medium mb-1">What this means</p>
            <ul className="space-y-1 text-[var(--color-muted-foreground)] text-xs list-disc list-inside">
              <li>All data, stores, and settings belong to your account.</li>
              <li>No other users can access your workspace.</li>
              <li>Your subscription covers your full access — no per-seat fees.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
