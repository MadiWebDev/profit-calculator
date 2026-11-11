"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HELP_FAQS, HELP_FAQ_CATEGORIES, groupFaqsByCategory, searchHelpItems } from "@/lib/help-content";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FaqExplorer() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const groups = useMemo(() => {
    const searched = searchHelpItems(HELP_FAQS, query, ["question", "answer"]);
    const inCategory = category === "All" ? searched : searched.filter((f) => f.category === category);
    return groupFaqsByCategory(inCategory);
  }, [query, category]);

  const total = groups.reduce((n, g) => n + g.faqs.length, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="faq-search">Search questions</Label>
          <Input
            id="faq-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. trial, TikTok, refund…"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {["All", ...HELP_FAQ_CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                category === c
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]" aria-live="polite">
          {total === HELP_FAQS.length
            ? `${total} questions`
            : `${total} of ${HELP_FAQS.length} questions match`}
        </p>
      </div>

      {total === 0 && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No questions match that search. Try &ldquo;trial&rdquo;, &ldquo;price&rdquo;, or &ldquo;Shopify&rdquo; — or{" "}
          <Link href="/help/contact" className="text-[var(--color-primary)] hover:underline">
            ask support
          </Link>
          .
        </p>
      )}

      {groups.map(({ category: cat, faqs }) => (
        <section key={cat} aria-labelledby={`faq-cat-${cat}`}>
          <h2 id={`faq-cat-${cat}`} className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            {cat}
          </h2>
          <div className="space-y-4">
            {faqs.map(({ id, question, answer }) => (
              <div key={id} id={id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5 scroll-mt-24">
                <h3 className="font-semibold text-[var(--color-foreground)] mb-2 text-sm sm:text-base">{question}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{answer}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
