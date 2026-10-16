"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CurrencySelector } from "@/components/dashboard/CurrencySelector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/calculators", label: "Calculators" },
  { href: "/features",    label: "Features" },
  { href: "/pricing",     label: "Pricing" },
  { href: "/blog",        label: "Blog" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-background)]/60">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
          {/* Logo — shrinks on phones so it never crowds the right-side controls */}
          <Link
            href="/"
            className="flex items-center gap-1.5 sm:gap-2 font-bold text-base sm:text-xl min-w-0 flex-shrink-0"
            aria-label="GetProfitCalc home"
          >
            <Image
              src="/getprofitcalc.png"
              alt="GetProfitCalc logo"
              width={100}
              height={100}
              className="h-8 w-8 sm:h-12 sm:w-12 rounded-lg object-contain flex-shrink-0"
              priority
            />
            <span className="text-[var(--color-foreground)] truncate">
              Get<span className="text-[var(--color-primary)]">Profit</span>Calc
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA + theme toggle */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Currency selector only in the top bar from sm+; on phones it
                lives inside the mobile menu below so the header row stays
                uncrowded next to the theme toggle and hamburger. */}
            <div className="hidden sm:block">
              <CurrencySelector size="md" />
            </div>
            <ThemeToggle />
            <div className="hidden md:flex items-center gap-2">
              {session?.user ? (
                <Button asChild size="sm">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/auth/login">Sign In</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/auth/register">Start Free Trial</Link>
                  </Button>
                </>
              )}
            </div>
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden flex-shrink-0"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "md:hidden border-t border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden transition-all duration-200",
          open ? "max-h-[28rem] overflow-y-auto" : "max-h-0"
        )}
        aria-hidden={!open}
      >
        <nav className="flex flex-col px-4 py-3 gap-1" aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 pb-1 border-t border-[var(--color-border)] mt-1 flex flex-col gap-2">
            {/* Currency selector — full width in mobile menu, hidden here on
                sm+ since it already shows in the top bar at that size. */}
            <div className="flex sm:hidden items-center justify-between px-1 py-1 gap-2">
              <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Display Currency</span>
              <CurrencySelector size="sm" />
            </div>
            {session?.user ? (
              <Button asChild size="sm" onClick={() => setOpen(false)}>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="outline" onClick={() => setOpen(false)}>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button asChild size="sm" onClick={() => setOpen(false)}>
                  <Link href="/auth/register">Start Free Trial</Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}