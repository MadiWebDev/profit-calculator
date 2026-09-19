"use client";

import { useState, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Calculator, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

const perks = [
  "7-day free trial — no credit card",
  "All 3 plans include CSV import",
  "Starts at $3/month after trial",
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
