"use client";

import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, CheckCircle, Mail, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  isEmailNotVerifiedSignIn,
  requestVerificationResend,
  fetchVerificationStatus,
} from "@/lib/email-verification";

const perks = [
  "7-day free trial — no credit card",
  "All 3 plans include CSV import",
  "Starts at $3/month after trial",
];

export default function RegisterPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState<{ name?: string; email?: string; password?: string }>({});
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [justVerified, setJustVerified] = useState(false);
  // Guards double-scheduling of the redirect (see the effect below).
  const redirectingRef = useRef(false);

  // While the verification modal is open, poll the verification status:
  // the user is in their inbox (another tab / their mail app) clicking the
  // link, and this tab has no other way to learn it happened. The poll
  // keeps running while the tab is hidden — that is the point: when the
  // user comes back, they are already on the sign-in page. Capped at 10
  // minutes; after that the manual "Go to Sign In" link still works.
  //
  // NOTE: `justVerified` is deliberately NOT a dependency. The poll sets
  // it when verification is detected, and if it were a dep the effect
  // would re-run on that update — its cleanup would clear the redirect
  // timer it just scheduled, and the modal would sit on "Email verified!"
  // forever. The ref above is the guard instead.
  useEffect(() => {
    if (!showVerifyModal || !registeredEmail) return;

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (redirectingRef.current) return;
      const { verified } = await fetchVerificationStatus(registeredEmail);
      if (cancelled || !verified) return;
      redirectingRef.current = true;
      setJustVerified(true);
      redirectTimer = setTimeout(() => router.push("/auth/login?verified=1"), 1500);
    };
    void check();
    const poll = setInterval(check, 5000);
    const stopAt = setTimeout(() => clearInterval(poll), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      redirectingRef.current = false;
      clearInterval(poll);
      clearTimeout(stopAt);
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [showVerifyModal, registeredEmail, router]);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const registerAction = useAsyncAction(async (name: string, email: string, password: string) => {
    const tid = toast.loading("Creating your account…");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email.toLowerCase(), password }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast.warning("Email already registered.", {
            id: tid,
            action: { label: "Sign in", onClick: () => router.push("/auth/login") },
          });
        } else {
          toast.error(json.error ?? "Registration failed.", { id: tid });
        }
        return;
      }

      toast.loading("Signing you in…", { id: tid });
      const sr = await signIn("credentials", { email: email.toLowerCase(), password, redirect: false });

      // NOTE: `sr.ok` is the HTTP status of the callback (200 even when the
      // sign-in fails), so it must never be the success test — check the
      // error first, exactly like the login page does. The old
      // `if (sr?.ok)` branch fired on every failed sign-in, pushed to
      // /onboarding, and the auth guard bounced to /auth/login — the
      // modal branch below was unreachable even with the right check.
      if (sr && isEmailNotVerifiedSignIn(sr)) {
        toast.dismiss(tid);
        setRegisteredEmail(email.toLowerCase());
        setShowVerifyModal(true);
      } else if (sr && !sr.error) {
        toast.success("Welcome to GetProfitCalc!", { id: tid });
        router.push("/onboarding");
        router.refresh();
      } else {
        toast.error("Account created — check your email to verify it, then sign in.", { id: tid });
        router.push("/auth/login?registered=1");
      }
    } catch {
      toast.error("Something went wrong. Try again.", { id: tid });
    }
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const name = nameRef.current?.value?.trim() ?? "";
    const email = emailRef.current?.value?.trim() ?? "";
    const password = passwordRef.current?.value ?? "";

    const errs: typeof err = {};
    if (!name) errs.name = "Name is required";
    if (!email) errs.email = "Email is required";
    if (!password) errs.password = "Password is required";
    else if (password.length < 10) errs.password = "At least 10 characters";
    if (Object.keys(errs).length) { setErr(errs); return; }
    setErr({});

    void registerAction.run(name, email, password);
  };

  const resendAction = useAsyncAction(async () => {
    if (!registeredEmail) return;
    // Honest feedback: the outcome only claims "sent" when the server
    // confirmed the email was accepted — a rate limit or send failure
    // is surfaced as an error, never as a false success.
    const outcome = await requestVerificationResend(registeredEmail);
    if (outcome.kind === "sent") toast.success(outcome.message);
    else if (outcome.kind === "queued") toast.info(outcome.message);
    else toast.error(outcome.message);
  });

  const resendVerification = () => {
    if (!registeredEmail) return;
    void resendAction.run();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4 py-12">
      <div className="w-full max-w-md">

        {/* ── Verify-email modal ─────────────────────────────────────── */}
        {showVerifyModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-modal-title"
          >
            <div className="relative w-full max-w-sm rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-8 shadow-xl text-center">
              {/* Close */}
              <button
                onClick={() => setShowVerifyModal(false)}
                className="absolute top-4 right-4 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              {justVerified ? (
                <>
                  {/* Icon */}
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950 mb-5">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>

                  <h2 id="verify-modal-title" className="text-xl font-bold text-[var(--color-foreground)] mb-2">
                    Email verified!
                  </h2>
                  <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
                    Taking you to sign in…
                  </p>

                  <Link
                    href="/auth/login?verified=1"
                    className="inline-flex w-full items-center justify-center h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Sign In Now
                  </Link>
                </>
              ) : (
                <>
                  {/* Icon */}
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 mb-5">
                    <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>

                  <h2 id="verify-modal-title" className="text-xl font-bold text-[var(--color-foreground)] mb-2">
                    Check your inbox
                  </h2>
                  <p className="text-sm text-[var(--color-muted-foreground)] mb-1">
                    We sent a verification link to
                  </p>
                  <p className="text-sm font-medium text-[var(--color-foreground)] mb-5 break-all">
                    {registeredEmail}
                  </p>
                  <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
                    Click the link in the email to verify your account, then sign in.
                  </p>

                  {/* Primary CTA */}
                  <Link
                    href="/auth/login"
                    className="inline-flex w-full items-center justify-center h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Go to Sign In
                  </Link>

                  {/* Resend */}
                  <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
                    Didn&apos;t receive it?{" "}
                    <button
                      type="button"
                      onClick={resendVerification}
                      disabled={resendAction.loading}
                      aria-busy={resendAction.loading || undefined}
                      className="text-[var(--color-primary)] font-medium hover:underline disabled:opacity-50"
                    >
                      {resendAction.loading ? "Sending…" : "Resend email"}
                    </button>
                  </p>
                </>
              )}
            </div>
          </div>
        )}

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
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mt-6 mb-1">Start your free trial</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">7 days free — no credit card required</p>
        </div>

        {/* Perks */}
        <div className="flex flex-wrap justify-center gap-4 mb-6">
          {perks.map((p) => (
            <div key={p} className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
              <CheckCircle className="h-3.5 w-3.5 text-[var(--color-primary)]" />
              {p}
            </div>
          ))}
        </div>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-sm">


      

          {/* Form — plain HTML, zero library wrappers */}
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="rg-name" className="text-sm font-medium leading-none">Full Name</label>
              <input
                id="rg-name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                ref={nameRef}
                disabled={registerAction.loading}
                className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
              />
              {err.name && <p className="text-xs text-red-500">{err.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rg-email" className="text-sm font-medium leading-none">Email</label>
              <input
                id="rg-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                ref={emailRef}
                disabled={registerAction.loading}
                className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
              />
              {err.email && <p className="text-xs text-red-500">{err.email}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rg-password" className="text-sm font-medium leading-none">Password</label>
              <div className="relative">
                <input
                  id="rg-password"
                  name="password"
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min. 10 characters"
                  ref={passwordRef}
                  disabled={registerAction.loading}
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
              loading={registerAction.loading}
              loadingText="Creating account…"
              className="w-full"
            >
              Create Free Account
            </Button>

            <p className="text-xs text-center text-[var(--color-muted-foreground)]">
              By signing up you agree to our{" "}
              <Link href="/terms-of-service" className="underline hover:text-[var(--color-foreground)]">Terms</Link>
              {" "}and{" "}
              <Link href="/privacy-policy" className="underline hover:text-[var(--color-foreground)]">Privacy Policy</Link>.
            </p>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--color-muted-foreground)]">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-[var(--color-primary)] font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
