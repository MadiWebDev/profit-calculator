"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

/* ── tiny inline primitives so we have zero dependency on shadcn hydration ── */
function Btn({
  children,
  type = "button",
  disabled,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const justRegistered = searchParams.get("registered") === "1";

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<{ email?: string; password?: string }>({});

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (justRegistered) toast.success("Account created — sign in to continue.");
  }, []); // eslint-disable-line

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = emailRef.current?.value?.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const errs: typeof err = {};
    if (!email) errs.email = "Email is required";
    if (!password) errs.password = "Password is required";
    if (Object.keys(errs).length) { setErr(errs); return; }
    setErr({});

    setLoading(true);
    try {
      const res = await signIn("credentials", { email: email.toLowerCase(), password, redirect: false });
      if (!res || res.error) { toast.error("Invalid email or password."); return; }
      toast.success("Welcome back!");
      router.push(callbackUrl);
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setLoading(false); }
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
            <div className="space-y-1.5">
              <label htmlFor="li-email" className="text-sm font-medium leading-none">Email</label>
              <input
                id="li-email"
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
              {loading ? <><Loader2 className="h-4 w-4 animate-spin"/>Signing in…</> : "Sign In"}
            </button>
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
