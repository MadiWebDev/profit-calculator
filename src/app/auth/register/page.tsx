"use client";

import { useState, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Calculator, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const perks = [
  "14-day free trial — no credit card",
  "All 3 plans include CSV import",
  "Starts at $2/month after trial",
];

export default function RegisterPage() {
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<{ name?: string; email?: string; password?: string }>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = nameRef.current?.value?.trim() ?? "";
    const email = emailRef.current?.value?.trim() ?? "";
    const password = passwordRef.current?.value ?? "";

    const errs: typeof err = {};
    if (!name) errs.name = "Name is required";
    if (!email) errs.email = "Email is required";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "At least 8 characters";
    if (Object.keys(errs).length) { setErr(errs); return; }
    setErr({});

    setLoading(true);
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

      if (sr?.ok) {
        toast.success("Welcome to GetProfitCalc!", { id: tid });
        router.push("/onboarding");
        router.refresh();
      } else {
        toast.success("Account created — please sign in.", { id: tid });
        router.push("/auth/login?registered=1");
      }
    } catch {
      toast.error("Something went wrong. Try again.", { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 font-bold text-2xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
              <Calculator className="h-5 w-5" />
            </span>
            <span>Profit<span className="text-[var(--color-primary)]">Calc</span></span>
          </Link>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mt-6 mb-1">Start your free trial</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">14 days free — no credit card required</p>
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

          {/* Google */}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              toast.loading("Redirecting to Google…", { id: "g" });
              signIn("google", { callbackUrl: "/onboarding" }).catch(() => {
                toast.dismiss("g");
                toast.error("Google sign-up failed.");
              });
            }}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-4 h-10 text-sm font-medium hover:bg-[var(--color-muted)] transition-colors disabled:opacity-50 mb-5"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign up with Google
          </button>

          {/* Divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--color-border)]"/></div>
            <div className="relative flex justify-center text-xs text-[var(--color-muted-foreground)]">
              <span className="bg-[var(--color-card)] px-3">or sign up with email</span>
            </div>
          </div>

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
                disabled={loading}
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
                disabled={loading}
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
                  placeholder="Min. 8 characters"
                  ref={passwordRef}
                  disabled={loading}
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

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin"/>Creating account…</> : "Create Free Account"}
            </button>

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
