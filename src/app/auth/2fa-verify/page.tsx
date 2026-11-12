"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

/**
 * 2FA login step (S1.1). Reached after a password login when the user
 * has 2FA enabled: the session carries twoFactorPending=true until this
 * page verifies a code (or a trusted-device cookie) and calls
 * session.update() to clear the flag. API routes reject pending sessions.
 */
export default function TwoFactorVerifyPage() {
  const { data: session, update, status } = useSession();
  const router = useRouter();
  // Landing page from the server-issued session role (superAdmin → /admin).
  const destination = resolvePostLoginRedirect({ role: session?.user?.role });
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  /* Redirect unauthenticated users to login */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "loading") return;
    (async () => {
      try {
        const res = await fetch("/api/auth/2fa/trusted-check", { method: "POST" });
        const j = await res.json();
        if (j.trusted) {
          await update({ user: { twoFactorPending: false } });
          router.push(destination);
          return;
        }
      } catch { /* fall through to code entry */ }
      setChecking(false);
    })();
  }, [update, router, status, destination]);

  const verifyAction = useAsyncAction(async () => {
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, rememberDevice }),
      });
      if (!res.ok) {
        setError("Invalid code. Try again, or use a recovery code.");
        return;
      }
      await update({ user: { twoFactorPending: false } });
      router.push(destination);
    } catch {
      setError("Could not reach the server. Try again.");
    }
  });

  const submit = () => {
    void verifyAction.run();
  };

  if (status === "loading" || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4 py-12">
        <Spinner size="md" className="text-[var(--color-primary)]" />
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mt-6 mb-1">Two-factor verification</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Enter the code from your authenticator app</p>
        </div>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm">

          <div className="flex justify-center mb-5">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-muted)]">
              <ShieldCheck className="h-8 w-8 text-[var(--color-primary)]" />
            </div>
          </div>

          <p className="text-sm text-[var(--color-muted-foreground)] mb-5 text-center">
            Enter the 6-digit code from your authenticator app, or a recovery code.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="2fa-verify-code" className="text-sm font-medium leading-none">
                Verification code
              </label>
              <input
                id="2fa-verify-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={verifyAction.loading}
                className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            <div className="flex items-center gap-2">
              <input
                id="2fa-remember"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                disabled={verifyAction.loading}
                className="h-4 w-4 rounded border-[var(--color-border)] disabled:opacity-50"
              />
              <label htmlFor="2fa-remember" className="text-sm text-[var(--color-muted-foreground)]">
                Remember this device for 30 days
              </label>
            </div>

            <Button
              onClick={submit}
              loading={verifyAction.loading}
              loadingText="Verifying…"
              className="w-full"
            >
              Verify
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
