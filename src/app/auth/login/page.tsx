"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";
import {
  isEmailNotVerifiedSignIn,
  requestVerificationResend,
} from "@/lib/email-verification";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const explicitCallbackUrl = searchParams.get("callbackUrl");
  const hasExplicitCallbackUrl = explicitCallbackUrl !== null;

  /* Already signed in (e.g. a superAdmin who revisits /auth/login):
     send them straight to their landing page instead of showing the form. */
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(
        resolvePostLoginRedirect({
          role: session?.user?.role,
          callbackUrl: explicitCallbackUrl,
          hasExplicitCallbackUrl,
        })
      );
    }
  }, [status, session, router, explicitCallbackUrl, hasExplicitCallbackUrl]);
  const justRegistered = searchParams.get("registered") === "1";

  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState<{ email?: string; password?: string }>({});
  const [needsVerify, setNeedsVerify] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (justRegistered) toast.success("Account created — sign in to continue.");
  }, []); // eslint-disable-line

  const signInAction = useAsyncAction(async (email: string, password: string) => {
    try {
      const res = await signIn("credentials", { email: email.toLowerCase(), password, redirect: false });
      if (!res || res.error) {
        if (res && isEmailNotVerifiedSignIn(res)) {
          // Registered, correct password, email not verified yet — say so
          // (and show the verify panel) instead of the generic error.
          // A wrong password still gets only the generic toast below, so
          // the unverified state can never be probed without the password.
          setNeedsVerify(email.toLowerCase());
          toast.info("Your email isn't verified yet — check your inbox for the verification link.");
          return;
        }
        toast.error("Invalid email or password."); return;
      }
      toast.success("Welcome back!");
      // Role comes from the fresh server-issued session, never from the client.
      const freshSession = await getSession();
      router.push(
        resolvePostLoginRedirect({
          role: freshSession?.user?.role,
          callbackUrl: explicitCallbackUrl,
          hasExplicitCallbackUrl,
        })
      );
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const email = emailRef.current?.value?.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const errs: typeof err = {};
    if (!email) errs.email = "Email is required";
    if (!password) errs.password = "Password is required";
    if (Object.keys(errs).length) { setErr(errs); return; }
    setErr({});
    setNeedsVerify(null);
    void signInAction.run(email, password);
  };

  const resendAction = useAsyncAction(async () => {
    if (!needsVerify) return;
    // Honest feedback: the outcome only claims "sent" when the server
    // confirmed the email was accepted — a rate limit or send failure
    // is surfaced as an error, never as a false success.
    const outcome = await requestVerificationResend(needsVerify);
    if (outcome.kind === "sent") toast.success(outcome.message);
    else if (outcome.kind === "queued") toast.info(outcome.message);
    else toast.error(outcome.message);
  });

  const resendVerification = () => {
    if (!needsVerify) return;
    void resendAction.run();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          
            <Link href="/" className="inline-flex items-center items-center font-bold text-xl" aria-label="GetProfitCalc home">
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
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mt-6 mb-1">Welcome back</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Sign in to your account</p>
        </div>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm">

      

          {/* Divider */}
          

          {/* Form — plain HTML form, no library wrappers */}
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {needsVerify && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">
                <p className="font-medium text-[var(--color-foreground)]">Please verify your email</p>
                <p className="mt-1 text-[var(--color-muted-foreground)]">
                  We sent a verification link to <span className="font-medium">{needsVerify}</span>.
                  Click it, then sign in again.
                </p>
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={resendAction.loading}
                  aria-busy={resendAction.loading || undefined}
                  className="mt-2 text-[var(--color-primary)] font-medium hover:underline disabled:opacity-50"
                >
                  {resendAction.loading ? "Sending…" : "Resend verification email"}
                </button>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="li-email" className="text-sm font-medium leading-none">Email</label>
              <input
                id="li-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                ref={emailRef}
                disabled={signInAction.loading}
                className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
              />
              {err.email && <p className="text-xs text-red-500">{err.email}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="li-password" className="text-sm font-medium leading-none">Password</label>
                <Link href="/auth/forgot-password" className="text-xs text-[var(--color-primary)] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="li-password"
                  name="password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  ref={passwordRef}
                  disabled={signInAction.loading}
                  className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 pr-10 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                  aria-label={showPass ? "Hide" : "Show"}
                >
                  {showPass ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                </button>
              </div>
              {err.password && <p className="text-xs text-red-500">{err.password}</p>}
            </div>

            <Button
              type="submit"
              loading={signInAction.loading}
              loadingText="Signing in…"
              className="w-full"
            >
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Don&apos;t have an account?{" "}
            <Link href="/auth/register" className="text-[var(--color-primary)] font-medium hover:underline">
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
