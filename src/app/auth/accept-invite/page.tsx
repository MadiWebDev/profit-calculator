"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function AcceptInviteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setError("Invalid invite link."); return; }

    fetch("/api/team/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setTeamName(j.teamName ?? "");
          setStatus("success");
          setTimeout(() => router.push("/dashboard"), 2500);
        } else if (j.expired) {
          setStatus("expired");
        } else {
          setStatus("error");
          setError(j.error ?? "Failed to accept invite.");
        }
      })
      .catch(() => { setStatus("error"); setError("Network error."); });
  }, [token, router]);

  return (
    <div className="min-h-screen bg-[var(--color-muted)] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-2xl mb-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
            <Calculator className="h-5 w-5" />
          </span>
          <span>Profit<span className="text-[var(--color-primary)]">Calc</span></span>
        </Link>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-[var(--color-primary)] mx-auto mb-4" />
              <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Accepting invitation…</h1>
              <p className="text-sm text-[var(--color-muted-foreground)]">Please wait a moment.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950 mb-5">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">You&apos;re in! 🎉</h1>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
                You&apos;ve joined <strong>{teamName}</strong> on CalcProfit. Redirecting you to the dashboard…
              </p>
              <Button asChild className="w-full">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </>
          )}

          {status === "expired" && (
            <>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-950 mb-5">
                <XCircle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Invitation expired</h1>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
                This invite link has expired (invites are valid for 48 hours). Ask your team to send a new invite.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/">Back to Home</Link>
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-5">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Something went wrong</h1>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-6">{error}</p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--color-muted)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
      </div>
    }>
      <AcceptInviteInner />
    </Suspense>
  );
}
