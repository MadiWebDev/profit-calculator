"use client";

import { ArrowUp } from "lucide-react";

export function BackToTop() {
  const handleClick = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={handleClick}
      className="fixed bottom-5 right-5 z-30 hidden h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] shadow-lg transition hover:-translate-y-1 hover:bg-[var(--color-muted)] sm:flex"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
