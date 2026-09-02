"use client";

import { Suspense, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Calculator, Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(!token);
  const [errs, setErrs] = useState<{ password?: string; confirm?: string }>({});

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const password = passwordRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";

    const nextErrs: typeof errs = {};
    if (!password) nextErrs.password = "Password is required";
    else if (password.length < 8) nextErrs.password = "At least 8 characters";
    if (!confirm) nextErrs.confirm = "Please confirm your password";
    else if (password !== confirm) nextErrs.confirm = "Passwords do not match";

    if (Object.keys(nextErrs).length) {
      setErrs(nextErrs);
      return;
    }
    setErrs({});
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 400 && json.error?.includes("invalid or has expired")) {
          setInvalid(true);
        } else {
          toast.error(json.error ?? "Something went wrong. Try again.");
        }
        return;
      }

      setDone(true);
      toast.success("Password updated successfully!");
      setTimeout(() => router.push("/auth/login"), 2500);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Invalid / expired token ── */
  if (invalid) {
    return (
      <div className="text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-5">
          <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Link invalid or expired</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
          This password reset link has expired or already been used. Reset links are valid for 1 hour.
        </p>
        <Link
          href="/auth/forgot-password"
          className="inline-flex items-center justify-center h-10 px-6 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  /* ── Success state ── */
  if (done) {
    return (
      <div className="text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950 mb-5">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Password updated!</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
          Your password has been changed. Redirecting you to sign in…
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center h-10 px-6 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Sign In
        </Link>
      </div>
    );
  }

  /* ── Form state ── */
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-1">Set a new password</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Choose a strong password with at least 8 characters.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {/* New password */}
        <div className="space-y-1.5">
          <label htmlFor="rp-password" className="text-sm font-medium leading-none">
            New password
          </label>
          <div className="relative">
            <input
              id="rp-password"
              name="password"
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
              placeholder="Min. 8 characters"
              ref={passwordRef}
              disabled={loading}
              className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 pr-10 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPass((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errs.password && <p className="text-xs text-red-500">{errs.password}</p>}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label htmlFor="rp-confirm" className="text-sm font-medium leading-none">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="rp-confirm"
              name="confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat your password"
              ref={confirmRef}
              disabled={loading}
              className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 pr-10 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errs.confirm && <p className="text-xs text-red-500">{errs.confirm}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Updating…</>
          ) : (
            "Update Password"
          )}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
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
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            </div>
          }>
            <ResetPasswordInner />
          </Suspense>
        </div>

      </div>
    </div>
  );
}
