"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Image from "next/image";
import VerifyResendForm from "@/components/auth/VerifyResendForm";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  // Derive the initial state from the token so the effect never has to
  // setState synchronously (react-hooks/set-state-in-effect).
  const [state, setState] = useState<"loading" | "success" | "expired" | "error">(() =>
    token ? "loading" : "error"
  );
  const [errorMsg, setErrorMsg] = useState(
    token ? "Verification failed." : "No verification token provided."
  );

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const j = await res.json();

        if (j.success === true) {
          setState("success");
          setTimeout(() => router.push("/auth/login?verified=1"), 2500);
        } else if (j.code === "TOKEN_EXPIRED") {
          setState("expired");
        } else {
          setState("error");
          setErrorMsg(j.error ?? "Verification failed.");
        }
      } catch {
        setState("error");
        setErrorMsg("Network error. Please try again.");
      }
    })();
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center font-bold text-xl" aria-label="GetProfitCalc home">
            <Image
              src="/getprofitcalc.png"
              alt="GetProfitCalc logo"
              width={100}
              height={100}
              className="h-12 w-12 rounded-lg object-contain"
              priority
            />
            <span className="text-[var(--color-foreground)]">
              Get<span className="text-[var(--color-primary)]">Profit</span>Calc
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mt-6 mb-1">Email Verification</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Confirming your email address</p>
        </div>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm text-center">

          {state === "loading" && (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)] mx-auto mb-4" />
              <p className="text-sm text-[var(--color-muted-foreground)]">Verifying your email…</p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950 mb-5">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Email verified!</h2>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
                Your email has been confirmed. Redirecting you to sign in…
              </p>
              <Link
                href="/auth/login?verified=1"
                className="inline-flex items-center justify-center h-10 px-6 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Sign In
              </Link>
            </>
          )}

          {state === "expired" && (
            <>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 mb-5">
                <XCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Link expired</h2>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                This verification link has expired. Request a new one below,
                or{" "}
                <Link href="/auth/login" className="text-[var(--color-primary)] font-medium hover:underline">
                  return to sign in
                </Link>
                .
              </p>
              <VerifyResendForm />
            </>
          )}

          {state === "error" && (
            <>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-5">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Verification failed</h2>
              <p className="text-sm text-[var(--color-muted-foreground)]">{errorMsg}</p>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-2">
                If the link never arrived or was lost, send yourself a new one:
              </p>
              <VerifyResendForm />
              <Link
                href="/auth/login"
                className="mt-4 inline-flex items-center justify-center h-10 px-6 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Return to Sign In
              </Link>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
