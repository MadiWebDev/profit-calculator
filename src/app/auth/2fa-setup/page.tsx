"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Shield, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

/**
 * Team-enforced 2FA enrolment. Reached from the dashboard layout redirect
 * when a session carries twoFactorSetupRequired (the member's team
 * requires 2FA for owners/admins and the member has none yet).
 *
 * Flow: setup → enter a code from the new secret → enable → recovery
 * codes shown ONCE → session flags cleared → dashboard. No QR code
 * library is bundled, so enrolment uses manual secret entry: every
 * authenticator app accepts pasting the secret shown here.
 */
export default function TwoFactorSetupPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  // Landing page from the server-issued session role (superAdmin → /admin).
  const destination = resolvePostLoginRedirect({ role: session?.user?.role });
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
        const j = await res.json();
        if (j.error === "Two-factor is already enabled") {
          await update({ user: { twoFactorPending: false, twoFactorSetupRequired: false } });
          router.push(destination);
          return;
        }
        if (!res.ok) throw new Error(j.error ?? "Setup failed");
        setSecret(j.secret);
        setOtpauthUrl(j.otpauthUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Setup failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router, update, destination]);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Invalid code");
        return;
      }
      setRecoveryCodes(j.recoveryCodes ?? []);
    } finally {
      setSubmitting(false);
    }
  };

  const finish = async () => {
    await update({ user: { twoFactorPending: false, twoFactorSetupRequired: false } });
    router.push(destination);
  };

  /* ── Loading states ── */
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4 py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  /* ── Fatal error (no secret retrieved) ── */
  if (error && !secret) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4 py-12">
        <div className="w-full max-w-md">
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
          </div>
          <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm text-center">
            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">Two-factor setup</h1>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Recovery codes shown after successful enable ── */
  if (recoveryCodes) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4 py-12">
        <div className="w-full max-w-md">
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
            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mt-6 mb-1">Two-factor enabled</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">Save your recovery codes</p>
          </div>

          <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm">
            <div className="flex justify-center mb-5">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
              Save these recovery codes somewhere safe — each works once if you lose your authenticator device:
            </p>
            <div className="font-mono text-sm bg-[var(--color-muted)] rounded-md p-4 mb-6">
              {recoveryCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <button
              onClick={finish}
              className="w-full h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {session?.user?.role === "superAdmin" ? "Continue to admin panel" : "Continue to dashboard"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Setup form ── */
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
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mt-6 mb-1">Set up two-factor authentication</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Secure your account with an authenticator app</p>
        </div>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm">

          <div className="flex justify-center mb-5">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-muted)]">
              <Shield className="h-8 w-8 text-[var(--color-primary)]" />
            </div>
          </div>

          <p className="text-sm text-[var(--color-muted-foreground)] mb-5">
            Your team requires two-factor authentication for admins. Add this account to your authenticator app
            with the secret below, then enter a code to confirm.
          </p>

          {secret && (
            <div className="space-y-4 mb-5">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Secret key</p>
                <div className="bg-[var(--color-muted)] rounded-md px-3 py-2">
                  <code className="font-mono text-sm break-all">{secret}</code>
                </div>
              </div>
              {otpauthUrl && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Auth URL</p>
                  <div className="bg-[var(--color-muted)] rounded-md px-3 py-2">
                    <code className="font-mono text-sm break-all">{otpauthUrl}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="2fa-code" className="text-sm font-medium leading-none">
                Verification code
              </label>
              <input
                id="2fa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Enabling…</> : "Enable two-factor"}
            </button>
          </div>

          <p className="mt-4 text-xs text-center text-[var(--color-muted-foreground)]">
            Any signed-in member can also open this page directly to enable two-factor authentication voluntarily.
          </p>
        </div>
      </div>
    </div>
  );
}
