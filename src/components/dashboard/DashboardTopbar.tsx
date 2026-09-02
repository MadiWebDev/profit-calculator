"use client";

import { useState } from "react";
import { Menu, X, Bell, Calculator } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { cn } from "@/lib/utils";

import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

interface DashboardTopbarProps {
  userName?: string;
  userEmail?: string;
  plan?: UserPlan;
  role?: UserRole;
}

export function DashboardTopbar({ userName, userEmail, plan, role }: DashboardTopbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile topbar */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md hover:bg-[var(--color-muted)] text-[var(--color-foreground)]"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 font-bold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
            <Calculator className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm">Profit<span className="text-[var(--color-primary)]">Calc</span></span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="relative z-50 flex flex-col w-64 h-full shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-md hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] z-10"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <DashboardSidebar userName={userName} userEmail={userEmail} plan={plan} role={role} />
          </div>
        </div>
      )}
    </>
  );
}
