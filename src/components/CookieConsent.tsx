"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const STORAGE_KEY = "profitcalc_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      // SSR or storage blocked
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {}
    setVisible(false);
  };

  const decline = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "declined");
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
    >
      <div className="mx-auto max-w-4xl rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          <p>
            We use cookies and Google AdSense to improve your experience and serve relevant ads.
            By clicking &quot;Accept&quot;, you consent to our use of cookies as described in our{" "}
            <Link href="/privacy-policy" className="text-[var(--color-primary)] hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={decline}>
            Decline
          </Button>
          <Button size="sm" onClick={accept}>
            Accept
          </Button>
          <button
            onClick={decline}
            aria-label="Close cookie banner"
            className="ml-1 p-1 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
