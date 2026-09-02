"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Calculator, Loader2, ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailErr, setEmailErr] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = emailRef.current?.value?.trim() ?? "";
    if (!email) {
      setEmailErr("Email is required");
      return;
    }
    setEmailErr("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? "Something went wrong. Try again.");
        return;
      }

      setSent(true);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 font-bold text-2xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
              <Calculator className="h-5 w-5" />
            </span>
            <span>Profit<span className="text-[var(--color-primary)]">Calc</span></span>
          </Link>
        </div>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm">

          {sent ? (
            /* ── Success state ── */
            <div className="text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950 mb-5">
                <Mail className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Check your inbox</h1>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
                If an account exists for{" "}
                <strong className="text-[var(--color-foreground)]">
                  {emailRef.current?.value?.trim()}
                </strong>
                , we&apos;ve sent a password reset link. It expires in <strong>1 hour</strong>.
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] mb-6">
                Didn&apos;t get the email? Check your spam folder or{" "}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="text-[var(--color-primary)] hover:underline font-medium"
                >
                  try again
                </button>
                .
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-1">Forgot your password?</h1>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="fp-email" className="text-sm font-medium leading-none">
                    Email address
                  </label>
                  <input
                    id="fp-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    ref={emailRef}
                    disabled={loading}
                    className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
                  />
                  {emailErr && <p className="text-xs text-red-500">{emailErr}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
